import { avaliarFollowup, mesmaConversa } from "./avaliar.js";
import type {
  AtendimentoFollowup,
  ConsultaAtendimentos,
  ControleFollowup,
  CrmFollowup,
  ProvedorFollowup,
  RegrasDaRodada,
} from "./contratos.js";

export class ProcessarAtendimento {
  constructor(
    private readonly consulta: ConsultaAtendimentos,
    private readonly controle: ControleFollowup,
    private readonly crm: CrmFollowup,
    private readonly provedor: ProvedorFollowup,
    private readonly agora: () => number = Date.now,
  ) {}

  private async permaneceIgual(a: AtendimentoFollowup): Promise<boolean> {
    const atual = await this.consulta.obter(a.id);
    return Boolean(
      atual &&
        mesmaConversa(a, atual) &&
        !(await this.controle.recusou(a.leadId)),
    );
  }

  async executar(
    a: AtendimentoFollowup,
    config: RegrasDaRodada,
    rodadaId: string,
    verificarCoordenacao: () => void = () => {},
  ): Promise<string> {
    verificarCoordenacao();
    const decisao = avaliarFollowup(
      a,
      config,
      await this.controle.envios(a.id),
      await this.controle.recusou(a.leadId),
      this.agora(),
    );
    if (decisao.acao === "IGNORAR") return decisao.motivo;
    if (decisao.acao === "ENCERRAR") {
      if (!(await this.permaneceIgual(a)))
        return "CONVERSA_MUDOU_ANTES_DE_ENCERRAR";
      verificarCoordenacao();
      await this.crm.finalizar(a.id, "followup-encerrar:" + decisao.envio.id);
      await this.controle.encerrado(decisao.envio.id);
      return "ENCERRADO_SEM_RESPOSTA";
    }
    if (!/^[+()\d\s-]+$/.test(a.telefone)) return "TELEFONE_INVALIDO";
    const pedido = {
      telefone: a.telefone.replace(/\D/g, ""),
      texto: decisao.texto,
      botoes: config.botoes,
    };
    this.provedor.validar(pedido);
    if (!(await this.permaneceIgual(a)))
      return "CONVERSA_MUDOU_ANTES_DE_RESERVAR";
    if (!(await this.controle.consumirLimite(rodadaId, config.limiteEnvios)))
      return "LIMITE_DA_RODADA";
    const reserva = await this.controle.reservar(
      a,
      decisao,
      config.botoes,
      rodadaId,
    );
    if (!reserva) {
      await this.controle.liberarLimite(rodadaId);
      return "RESERVA_LOCAL_NEGADA";
    }
    verificarCoordenacao();
    const autorizacao = await this.crm.reservar(
      a.leadId,
      decisao.regra.id,
      decisao.ciclo,
      reserva.chave,
      rodadaId,
    );
    if (!autorizacao.podeEnviar) {
      // Cooldown/teto podem liberar depois. Chave ja usada NAO libera outro envio.
      const adiar = [
        "COOLDOWN",
        "TETO_DIARIO",
        "AUTOMACAO_PROATIVA_DESLIGADA",
        "TIPO_DESLIGADO",
      ].includes(autorizacao.motivo);
      await this.controle.marcar(
        reserva.id,
        adiar ? "ADIADO" : "NEGADO",
        autorizacao.motivo,
      );
      await this.controle.liberarLimite(rodadaId);
      return "CRM_NEGOU_" + autorizacao.motivo;
    }
    if (!(await this.permaneceIgual(a))) {
      await this.controle.marcar(
        reserva.id,
        "CANCELADO",
        "CONVERSA_MUDOU_APOS_RESERVA",
      );
      await this.controle.liberarLimite(rodadaId);
      return "CONVERSA_MUDOU_APOS_RESERVA";
    }
    // Persistir ANTES de chamar o provedor protege o intervalo entre envio e comprovante.
    // Uma queda aqui deixa EM_ENVIO visivel para conciliacao, nunca para reenvio automatico.
    await this.controle.marcar(reserva.id, "EM_ENVIO");
    // A trava pertence a uma conexao dedicada. Se ela caiu, nao inicie outro efeito.
    verificarCoordenacao();
    let provedorId: string;
    try {
      provedorId = await this.provedor.enviar(pedido);
    } catch {
      await this.controle.marcar(
        reserva.id,
        "INCERTO",
        "RESULTADO_DO_PROVEDOR_NAO_COMPROVADO",
      );
      return "ENVIO_INCERTO";
    }
    const comprovante = await this.controle.comprovar(reserva.id, provedorId);
    try {
      const mensagemId = await this.crm.registrar(comprovante);
      await this.controle.registrado(reserva.id, mensagemId);
      return "ENVIADO_E_REGISTRADO";
    } catch {
      // A proxima rodada repete apenas o registro CRM, usando o mesmo ID do provedor.
      return "ENVIADO_REGISTRO_CRM_PENDENTE";
    }
  }

  async recuperarRegistros(): Promise<number> {
    let recuperados = 0;
    for (const envio of await this.controle.pendentes(100)) {
      try {
        const mensagem = await this.crm.registrar(envio);
        await this.controle.registrado(envio.id, mensagem);
        recuperados++;
      } catch {
        // Falha continua pendente. Nao transforma um registro faltante em outro envio.
        await this.controle.marcar(
          envio.id,
          "ENVIADO",
          "REGISTRO_CRM_PENDENTE",
        );
      }
    }
    return recuperados;
  }
}
