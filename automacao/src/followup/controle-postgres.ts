import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type {
  AtendimentoFollowup,
  Botao,
  ComprovanteEnvio,
  ControleFollowup,
  DecisaoFollowup,
  EnvioRegistrado,
} from "./contratos.js";

const COMPROVANTE = `id::text,crm_atendimento_id AS "atendimentoId",follow_up_config_id AS "regraId",
  chave_envio AS chave,execucao_id AS "execucaoId",mensagem_enviada AS texto,botoes,whatsapp_message_id AS "provedorId"`;

export class ControlePostgres implements ControleFollowup {
  constructor(private readonly pool: Pool) {}
  async recusou(leadId: string): Promise<boolean> {
    const r = await this.pool.query(
      "SELECT 1 FROM public.follow_up_opt_outs WHERE lead_id=$1",
      [leadId],
    );
    return r.rows.length > 0;
  }
  async envios(atendimentoId: string): Promise<EnvioRegistrado[]> {
    const r = await this.pool.query(
      `SELECT id::text,follow_up_config_id AS "regraId",lead_ultima_mensagem_em AS ciclo,
      status,coalesce(mensagem_enviada,'') AS texto,enviado_em AS "enviadoEm",encerrado_em AS "encerradoEm",crm_mensagem_id AS "crmMensagemId"
      FROM public.follow_ups_temporary WHERE crm_atendimento_id=$1 ORDER BY enviado_em DESC NULLS LAST,id DESC`,
      [atendimentoId],
    );
    return r.rows.map((r) => ({
      ...r,
      ciclo: r.ciclo?.toISOString() || "",
      enviadoEm: r.enviadoEm?.toISOString() || null,
      encerradoEm: r.encerradoEm?.toISOString() || null,
    }));
  }
  async reservar(
    a: AtendimentoFollowup,
    d: Extract<DecisaoFollowup, { acao: "ENVIAR" }>,
    botoes: Botao[],
    rodadaId: string,
  ) {
    const chave =
      "followup:" +
      createHash("sha256")
        .update([a.id, d.regra.id, d.ciclo].join(":"))
        .digest("hex");
    // Verifica tambem o timestamp: o n8n pode ter salvo a mesma data com outra representacao textual.
    const r = await this.pool.query<{ id: string }>(
      `INSERT INTO public.follow_ups_temporary
      (follow_up_config_id,lead_id,crm_atendimento_id,regra_followup_nome,lead_ultima_mensagem_em,
       lead_ultima_mensagem_chave,ultima_mensagem_base_em,mensagem_enviada,status,executor,chave_envio,execucao_id,botoes)
      SELECT $1,$2,$3,$4,$5::text::timestamptz,$5::text,$6,$7,'RESERVADO','TYPESCRIPT',$8,$9,$10::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM public.follow_up_opt_outs WHERE lead_id=$2)
      AND NOT EXISTS (SELECT 1 FROM public.follow_ups_temporary WHERE crm_atendimento_id=$3
        AND follow_up_config_id=$1 AND lead_ultima_mensagem_em=$5::text::timestamptz AND status<>'ADIADO')
      ON CONFLICT (crm_atendimento_id,follow_up_config_id,lead_ultima_mensagem_chave)
      DO UPDATE SET status='RESERVADO',execucao_id=EXCLUDED.execucao_id,botoes=EXCLUDED.botoes,
        mensagem_enviada=EXCLUDED.mensagem_enviada,updated_at=now()
      WHERE follow_ups_temporary.executor='TYPESCRIPT' AND follow_ups_temporary.status='ADIADO'
      RETURNING id::text`,
      [
        d.regra.id,
        a.leadId,
        a.id,
        d.regra.nome,
        d.ciclo,
        a.ultima!.em,
        d.texto,
        chave,
        rodadaId,
        JSON.stringify(botoes),
      ],
    );
    return r.rows[0] ? { id: r.rows[0].id, chave } : null;
  }
  async marcar(id: string, status: string, motivo = ""): Promise<void> {
    await this.pool.query(
      "UPDATE public.follow_ups_temporary SET status=$2,motivo_operacional=$3,updated_at=now() WHERE id=$1 AND executor='TYPESCRIPT'",
      [id, status, motivo],
    );
  }
  async consumirLimite(rodadaId: string, limite: number): Promise<boolean> {
    // Incremento atomico compartilha o mesmo teto entre os dois workers.
    const r = await this.pool.query(
      `UPDATE automacao_infra.followup_rodada SET tentativas_envio=tentativas_envio+1
      WHERE id=$1 AND tentativas_envio<$2 RETURNING id`,
      [rodadaId, limite],
    );
    return r.rows.length > 0;
  }
  async comprovar(id: string, provedorId: string): Promise<ComprovanteEnvio> {
    const r = await this.pool.query<ComprovanteEnvio>(
      `UPDATE public.follow_ups_temporary
      SET whatsapp_message_id=$2,status='ENVIADO',enviado_em=now(),updated_at=now()
      WHERE id=$1 AND executor='TYPESCRIPT' AND status='EM_ENVIO' RETURNING ${COMPROVANTE}`,
      [id, provedorId],
    );
    if (!r.rows[0]) throw new Error("COMPROVANTE_NAO_PERSISTIDO");
    return r.rows[0];
  }
  async liberarLimite(rodadaId: string): Promise<void> {
    await this.pool.query(
      "UPDATE automacao_infra.followup_rodada SET tentativas_envio=greatest(0,tentativas_envio-1) WHERE id=$1",
      [rodadaId],
    );
  }
  async registrado(id: string, mensagemId: string): Promise<void> {
    await this.pool.query(
      "UPDATE public.follow_ups_temporary SET crm_mensagem_id=$2,updated_at=now() WHERE id=$1 AND status='ENVIADO'",
      [id, mensagemId],
    );
  }
  async encerrado(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE public.follow_ups_temporary SET encerrado_em=now(),motivo_encerramento='SEM_RESPOSTA',updated_at=now() WHERE id=$1",
      [id],
    );
  }
  async pendentes(limite: number): Promise<ComprovanteEnvio[]> {
    const r = await this.pool.query<ComprovanteEnvio>(
      `SELECT ${COMPROVANTE} FROM public.follow_ups_temporary
      WHERE executor='TYPESCRIPT' AND status='ENVIADO' AND crm_mensagem_id IS NULL AND whatsapp_message_id IS NOT NULL
      ORDER BY updated_at,id LIMIT $1`,
      [limite],
    );
    return r.rows;
  }
}
