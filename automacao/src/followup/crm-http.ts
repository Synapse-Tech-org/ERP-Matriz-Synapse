import type {
  ComprovanteEnvio,
  CrmFollowup,
  RegrasDaRodada,
} from "./contratos.js";
import { lerRegrasCrm, type OpcoesRegras } from "./configuracao-crm.js";
import { objeto, textoObrigatorio, type TransporteJson } from "./http.js";

export class CrmHttpFollowup implements CrmFollowup {
  constructor(
    private readonly base: string,
    private readonly token: string,
    private readonly http: TransporteJson,
    private readonly opcoes: OpcoesRegras,
  ) {}

  private chamar(
    path: string,
    corpo?: unknown,
    headers: Record<string, string> = {},
  ) {
    return this.http.chamar(
      this.base + "/internal/v1" + path,
      { "X-Synapse-Token": this.token, ...headers },
      corpo,
    );
  }
  async configuracao(): Promise<RegrasDaRodada> {
    const config = await this.chamar("/automation-config");
    const regras = await this.chamar("/regras/follow-up");
    return lerRegrasCrm(config, regras, this.opcoes);
  }
  async reservar(
    leadId: string,
    regraId: string,
    ciclo: string,
    chave: string,
    execucao: string,
  ) {
    const r = objeto(
      await this.chamar(
        `/leads/${encodeURIComponent(leadId)}/envios-proativos/reservas`,
        {
          tipo: "FOLLOW_UP",
          regraId,
          ocorrencia: ciclo,
          chave,
          execucaoId: execucao,
        },
      ),
    );
    if (typeof r.podeEnviar !== "boolean")
      throw new Error("RESERVA_CRM_INVALIDA");
    return {
      podeEnviar: r.podeEnviar,
      motivo: typeof r.motivo === "string" ? r.motivo : "RESERVA_NEGADA",
    };
  }
  async registrar(envio: ComprovanteEnvio): Promise<string> {
    const r = objeto(
      await this.chamar(
        `/atendimentos/${encodeURIComponent(envio.atendimentoId)}/mensagens-enviadas`,
        {
          wamid: envio.provedorId,
          tipo: "BOTOES",
          conteudo: envio.texto,
          opcoes: JSON.stringify(
            envio.botoes.map((b) => ({ id: b.id, titulo: b.titulo })),
          ),
          chaveDeEnvio: envio.chave,
          origemTipo: "FOLLOW_UP",
          origemRegraId: envio.regraId,
          origemExecucaoId: envio.execucaoId,
        },
      ),
    );
    return textoObrigatorio(r.mensagemId);
  }
  async finalizar(atendimentoId: string, chave: string): Promise<void> {
    await this.chamar(
      `/atendimentos/${encodeURIComponent(atendimentoId)}/finalizar`,
      {},
      { "Idempotency-Key": chave },
    );
  }
}
