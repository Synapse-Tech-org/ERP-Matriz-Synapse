import type { Pool } from "pg";
import type { Lead } from "./regras.js";

export class LeadsCrm {
  constructor(private pool: Pool) {}
  async pagina(apos: string | null, permitidos: readonly string[]) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN READ ONLY");
      await c.query("SELECT set_config('app.papel','SERVICO',true)");
      // Somente o atendimento mais recente daquele lead pode receber o registro.
      const r = await c.query<Lead>(`SELECT l.id, l.nome, regexp_replace(l.telefone,'[^0-9]','','g') AS telefone,
        a.id AS "atendimentoId", a.status, l.criado_em::text AS "criadoEm",
        l.ultima_interacao_em::text AS "ultimaInteracaoEm", l.ultima_mensagem_do_lead_em::text AS "ultimaEntradaEm"
        FROM public.lead l LEFT JOIN LATERAL (
          SELECT id,status FROM public.atendimento WHERE lead_id=l.id ORDER BY iniciado_em DESC,id DESC LIMIT 1
        ) a ON true WHERE ($1::uuid IS NULL OR l.id>$1)
          AND regexp_replace(l.telefone,'[^0-9]','','g')=ANY($2::text[])
        ORDER BY l.id LIMIT 200`, [apos, permitidos]);
      await c.query("COMMIT");
      return r.rows;
    } catch (erro) { await c.query("ROLLBACK"); throw erro; }
    finally { c.release(); }
  }
}
