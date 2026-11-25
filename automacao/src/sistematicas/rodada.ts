import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { CanalSistematico, Template } from "./canal.js";
import type { CrmSistematicas } from "./crm.js";
import type { LeadsCrm } from "./leads.js";
import { calendario, dentroDoExpediente, fidelizacao, personalizar, type Lead, type Candidato } from "./regras.js";
import { FalhaIntegracao, textoObrigatorio } from "../followup/http.js";

type Contagem = Record<string, number>;
const contar = (r: Contagem, motivo: string) => { r[motivo] = (r[motivo] ?? 0) + 1; };

export class RodadaSistematica {
  constructor(private db: Pool, private crm: Pick<CrmSistematicas,"configuracao"|"catalogo"|"reservar"|"registrar">,
    private leads: Pick<LeadsCrm,"pagina">, private canal: CanalSistematico, private numeros: ReadonlySet<string> | null,
    private fuso: string, private meta: boolean, private agora = () => new Date()) {}

  async executar() {
    const id = randomUUID();
    const resultados: Contagem = {};
    await this.db.query("INSERT INTO automacao_infra.followup_rodada(id,fluxo) VALUES ($1,'mensagens-sistematicas')", [id]);
    try {
      await this.conciliar(resultados);
      await this.selecionar(id, resultados);
    } catch (e) {
      // Nunca guardar URLs de provedor, tokens ou a mensagem do cliente no painel.
      const erro = e instanceof FalhaIntegracao ? e.codigo : e instanceof Error && /^[A-Z_]{3,80}$/.test(e.message) ? e.message : "CONFIG_OU_CONSULTA";
      contar(resultados, "FALHA_" + erro);
    }
    if (!Object.keys(resultados).length) contar(resultados, "SEM_CANDIDATOS");
    const falhou = Object.keys(resultados).some(k => /FALHA|INCERTO|PENDENTE/.test(k));
    await this.db.query("UPDATE automacao_infra.followup_rodada SET finalizado_em=now(),status=$2,resultados=$3 WHERE id=$1",
      [id, falhou ? "error" : "success", resultados]);
  }

  private async selecionar(id: string, resultados: Contagem) {
    const { politica, expediente, parametros } = await this.crm.configuracao();
    const permitidoAgora = () => !politica.somenteHorarioComercial || dentroDoExpediente(calendario(this.agora(), this.fuso), expediente);
    if (!permitidoAgora()) { contar(resultados, "FORA_DO_EXPEDIENTE"); return; }
    const dia = calendario(this.agora(), this.fuso).data;
    const catalogo = await this.crm.catalogo();
    const template = this.meta ? {
      nome: textoObrigatorio(parametros.get("sistematicas.meta.template_nome")),
      idioma: textoObrigatorio(parametros.get("sistematicas.meta.template_idioma")),
      parametro: textoObrigatorio(parametros.get("sistematicas.meta.parametro_texto")),
    } : undefined;
    let cursor: string | null = null;
    for (;;) {
      const pagina: Lead[] = await this.leads.pagina(cursor, this.numeros ? [...this.numeros] : null);
      for (const lead of pagina) {
        cursor = lead.id;
        if (this.numeros && !this.numeros.has(lead.telefone)) { contar(resultados, "FORA_DO_PUBLICO"); continue; }
        const pedidos: Candidato[] = [];
        if (catalogo.ids.has(lead.id)) pedidos.push({ tipo: "ANIVERSARIO", regra: "ANIVERSARIO", ciclo: dia.slice(0,4), texto: catalogo.aniversario });
        for (const f of catalogo.festivas) pedidos.push({ tipo: "FESTIVA", regra: f.id, ciclo: dia, texto: f.mensagem });
        const faixa = fidelizacao(lead, catalogo.regras, politica, this.agora());
        if (faixa) pedidos.push(faixa);
        for (const pedido of pedidos) {
          if (!permitidoAgora() || calendario(this.agora(), this.fuso).data !== dia) { contar(resultados, "JANELA_ENCERRADA"); return; }
          contar(resultados, await this.processar(id, lead, pedido, template));
        }
      }
      if (pagina.length < 200) break;
    }
  }

  private async processar(id: string, lead: Lead, p: Candidato, template?: Template) {
    if (!lead.atendimentoId) return "SEM_ATENDIMENTO_PARA_REGISTRO";
    const texto = personalizar(p.texto, lead.nome ?? "");
    if (!texto) return "MENSAGEM_INCOMPLETA";
    const chave = "sist:" + createHash("sha256").update(JSON.stringify([lead.id,p.tipo,p.regra,p.ciclo])).digest("hex");
    if (!await this.crm.reservar(lead.id, p, chave, id)) return "RESERVA_NEGADA_CRM";
    // O EV-07 chama a categoria de DATA_FESTIVA no banco; o CRM a chama de FESTIVA.
    const categoria = p.tipo === "FESTIVA" ? "DATA_FESTIVA" : p.tipo;
    const reserva = await this.db.query(`INSERT INTO public.ev07_envios_automaticos
      (chave_envio,rodada_id,atendimento_id,lead_id,categoria,texto_enviado,referencia_id,ciclo_chave,telefone,payload_meta)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}') ON CONFLICT DO NOTHING`,
      [chave,id,lead.atendimentoId,lead.id,categoria,texto,p.regra,p.ciclo,lead.telefone]);
    if (!reserva.rowCount) return "JA_RESERVADO";
    let provedorId: string;
    try { provedorId = await this.canal.enviar(lead.telefone, texto, template); }
    catch (erro) {
      await this.db.query("UPDATE public.ev07_envios_automaticos SET status='INCERTO',updated_at=now() WHERE chave_envio=$1", [chave]);
      return erro instanceof FalhaIntegracao ? "ENVIO_INCERTO_" + erro.codigo : "ENVIO_INCERTO";
    }
    await this.db.query("UPDATE public.ev07_envios_automaticos SET status='REGISTRO_PENDENTE',provedor_id=$2,enviado_em=now(),updated_at=now() WHERE chave_envio=$1", [chave,provedorId]);
    return this.registrar(chave, lead.atendimentoId, texto, provedorId);
  }

  private async registrar(chave: string, atendimento: string, texto: string, provedorId: string) {
    try {
      const crmId = await this.crm.registrar(atendimento, chave, texto, provedorId);
      await this.db.query("UPDATE public.ev07_envios_automaticos SET status='ENVIADO',crm_id=$2,updated_at=now() WHERE chave_envio=$1", [chave,crmId]);
      return "ACEITO_E_REGISTRADO";
    } catch (erro) { return erro instanceof FalhaIntegracao ? "REGISTRO_PENDENTE_" + erro.codigo : "REGISTRO_PENDENTE"; }
  }

  private async conciliar(resultados: Contagem) {
    // O provedor ja aceitou. Repetir apenas o registro idempotente do CRM, nunca o WhatsApp.
    const { rows } = await this.db.query("SELECT chave_envio AS chave,atendimento_id AS atendimento,texto_enviado AS texto,provedor_id FROM public.ev07_envios_automaticos WHERE status='REGISTRO_PENDENTE' AND chave_envio IS NOT NULL ORDER BY id LIMIT 200");
    for (const r of rows) contar(resultados, await this.registrar(r.chave,r.atendimento,r.texto,r.provedor_id));
  }
}
