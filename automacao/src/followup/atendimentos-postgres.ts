import type { Pool, QueryResultRow } from "pg";
import type { AtendimentoFollowup, ConsultaAtendimentos } from "./contratos.js";

const CAMPOS = `a.id::text AS id, a.lead_id::text AS "leadId", l.nome,
  coalesce(l.telefone,'') AS telefone, a.status::text AS status,
  (SELECT jsonb_build_object('id',m.id,'em',m.enviado_em,'remetente',m.remetente_tipo,
    'texto',coalesce(m.conteudo,''),'status',m.status_entrega)
   FROM public.mensagem m WHERE m.atendimento_id=a.id
   ORDER BY m.enviado_em DESC,m.id DESC LIMIT 1) AS ultima,
  (SELECT jsonb_build_object('id',m.id,'em',m.enviado_em,'remetente',m.remetente_tipo,
    'texto','','status',m.status_entrega)
   FROM public.mensagem m WHERE m.atendimento_id=a.id AND m.remetente_tipo='LEAD'
   ORDER BY m.enviado_em DESC,m.id DESC LIMIT 1) AS "ultimaDoLead"`;

export class AtendimentosPostgres implements ConsultaAtendimentos {
  constructor(private readonly pool: Pool) {}

  private async consultar<T extends QueryResultRow>(
    sql: string,
    valores: unknown[],
  ): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      // A RLS do CRM exige contexto de servico. SET LOCAL nao vaza para a proxima consulta do pool.
      await client.query("SELECT set_config('app.papel','SERVICO',true)");
      const r = await client.query<T>(sql, valores);
      await client.query("COMMIT");
      return r.rows;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async ultimoId(): Promise<string | null> {
    const r = await this.consultar<{ id: string }>(
      "SELECT id::text FROM public.atendimento ORDER BY id DESC LIMIT 1",
      [],
    );
    return r[0]?.id || null;
  }
  async listar(
    apos: string | null,
    limite: number,
    ate: string,
  ): Promise<AtendimentoFollowup[]> {
    return this.consultar<AtendimentoFollowup>(
      `SELECT ${CAMPOS}
      FROM public.atendimento a JOIN public.lead l ON l.id=a.lead_id
      WHERE ($1::uuid IS NULL OR a.id>$1::uuid) AND a.id<=$2::uuid
      AND a.status IN ('EM_IA','EM_ATENDIMENTO')
      ORDER BY a.id LIMIT $3`,
      [apos, ate, limite],
    );
  }
  async obter(id: string): Promise<AtendimentoFollowup | null> {
    const r = await this.consultar<AtendimentoFollowup>(
      `SELECT ${CAMPOS}
      FROM public.atendimento a JOIN public.lead l ON l.id=a.lead_id WHERE a.id=$1::uuid`,
      [id],
    );
    return r[0] || null;
  }
}
