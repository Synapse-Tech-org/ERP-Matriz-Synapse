import { Pool } from "pg";
import type { ConfiguracaoBanco } from "./configuracao.js";
import type {
  DetalheExecucao,
  EstadoBanco,
  ExecucaoResumo,
  FiltroExecucoes,
  PaginaExecucoes,
  RepositorioExecucoes,
} from "./contratos.js";
import { aplicarMigracoes } from "./migracoes.js";
import { lerEtapas } from "./etapas.js";

export class RepositorioExecucoesPostgres implements RepositorioExecucoes {
  private readonly pool: Pool;
  private atual: EstadoBanco = "BANCO_INDISPONIVEL";
  private colunas = new Map<string, Set<string>>();
  private readonly schema: string;

  constructor(config: ConfiguracaoBanco) {
    this.schema = '"' + config.schema + '"';
    this.pool = new Pool({
      ...config,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 10000,
      statement_timeout: 4000,
      query_timeout: 5000,
    });
    this.pool.on("error", () => {
      this.atual = "BANCO_INDISPONIVEL";
    });
  }
  estado(): EstadoBanco {
    return this.atual;
  }
  async preparar(): Promise<void> {
    try {
      const marker = await this.pool.query(
        "SELECT versao FROM automacao_infra.provisionamento WHERE id=1",
      );
      if (marker.rows[0]?.versao !== 1)
        throw new Error("MARCADOR_INCOMPATIVEL");
      const columns = await this.pool.query<{
        table_name: string;
        column_name: string;
      }>(
        "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[])",
        [
          this.schema.slice(1, -1),
          ["execution_entity", "execution_data", "workflow_entity"],
        ],
      );
      this.colunas.clear();
      for (const c of columns.rows) {
        const set = this.colunas.get(c.table_name) || new Set<string>();
        set.add(c.column_name);
        this.colunas.set(c.table_name, set);
      }
      if (
        !["id", "status", "startedAt", "stoppedAt"].every((c) =>
          this.tem("execution_entity", c),
        )
      ) {
        this.atual = "ESTRUTURA_INCOMPATIVEL";
        throw new Error("ESTRUTURA_N8N_NAO_SUPORTADA");
      }
      await aplicarMigracoes(this.pool);
      this.atual = "PRONTO";
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "42P01" || code === "42703")
        this.atual = "ESTRUTURA_INCOMPATIVEL";
      else if (this.atual !== "ESTRUTURA_INCOMPATIVEL")
        this.atual = "BANCO_INDISPONIVEL";
      throw new Error("BANCO_AUTOMACAO_NAO_PRONTO");
    }
  }
  private tem(tabela: string, coluna: string): boolean {
    return this.colunas.get(tabela)?.has(coluna) === true;
  }
  private selecao(): { campos: string; join: string } {
    const workflow = this.tem("execution_entity", "workflowId");
    const nome =
      workflow &&
      this.tem("workflow_entity", "id") &&
      this.tem("workflow_entity", "name");
    return {
      campos: `e.id::text AS id, ${workflow ? 'e."workflowId"::text' : "NULL::text"} AS "fluxoId", ${nome ? "w.name" : "NULL::text"} AS "fluxoNome", e.status, e."startedAt" AS "iniciadoEm", e."stoppedAt" AS "finalizadoEm", ${this.tem("execution_entity", "mode") ? "e.mode" : "NULL::text"} AS modo`,
      join: nome
        ? ` LEFT JOIN ${this.schema}.workflow_entity w ON w.id=e."workflowId"`
        : "",
    };
  }
  private pronto(): void {
    if (this.atual !== "PRONTO") throw new Error("BANCO_AUTOMACAO_NAO_PRONTO");
  }
  private execucoes(): string {
    const s = this.selecao();
    // Preserva a leitura do clone n8n. As rodadas TS possuem formato proprio,
    // sem simular serializacao interna de nodes ou depender da versao do n8n.
    return `SELECT ${s.campos} FROM ${this.schema}.execution_entity e${s.join}
      UNION ALL SELECT 'fu_'||id::text,'followup-typescript','Follow-up TypeScript',status,
        iniciado_em,finalizado_em,'schedule' FROM automacao_infra.followup_rodada`;
  }
  async resumo(): Promise<{
    total: number;
    sucesso: number;
    falhas: number;
    emExecucao: number;
  }> {
    this.pronto();
    const r = await this.pool.query<{
      total: string;
      sucesso: string;
      falhas: string;
      emExecucao: string;
    }>(
      `SELECT count(*) AS total,count(*) FILTER (WHERE status='success') AS sucesso,count(*) FILTER (WHERE status IN ('error','crashed')) AS falhas,count(*) FILTER (WHERE status IN ('new','running','waiting')) AS "emExecucao" FROM (${this.execucoes()}) e`,
    );
    const x = r.rows[0];
    if (!x) throw new Error("RESUMO_INDISPONIVEL");
    return {
      total: Number(x.total),
      sucesso: Number(x.sucesso),
      falhas: Number(x.falhas),
      emExecucao: Number(x.emExecucao),
    };
  }
  async listar(filtro: FiltroExecucoes): Promise<PaginaExecucoes> {
    this.pronto();
    const values: (string | number)[] = [];
    const where = filtro.status ? " WHERE e.status=$1" : "";
    if (filtro.status) values.push(filtro.status);
    const count = await this.pool.query<{ total: string }>(
      `SELECT count(*) AS total FROM (${this.execucoes()}) e${where}`,
      values,
    );
    const r = await this.pool.query<ExecucaoResumo>(
      `SELECT e.* FROM (${this.execucoes()}) e${where} ORDER BY e."iniciadoEm" DESC NULLS LAST,e.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, filtro.tamanho, filtro.pagina * filtro.tamanho],
    );
    return {
      itens: r.rows,
      pagina: filtro.pagina,
      tamanho: filtro.tamanho,
      total: Number(count.rows[0]?.total || 0),
    };
  }
  async detalhar(id: string): Promise<DetalheExecucao | null> {
    this.pronto();
    if (/^fu_[a-f0-9-]{36}$/i.test(id)) return this.detalharFollowup(id);
    const s = this.selecao();
    const r = await this.pool.query<ExecucaoResumo>(
      `SELECT ${s.campos} FROM ${this.schema}.execution_entity e${s.join} WHERE e.id::text=$1`,
      [id],
    );
    const execucao = r.rows[0];
    if (!execucao) return null;
    let etapas: DetalheExecucao["etapas"] | undefined;
    if (
      this.tem("execution_data", "executionId") &&
      this.tem("execution_data", "data")
    ) {
      // Limite antes de transferir o payload. Dados brutos nunca saem da API.
      const d = await this.pool.query<{ data: string | null }>(
        `SELECT CASE WHEN octet_length(data::text)<=$2 THEN data::text ELSE NULL END AS data FROM ${this.schema}.execution_data WHERE "executionId"::text=$1`,
        [id, 1048576],
      );
      if (d.rows[0]?.data) etapas = lerEtapas(d.rows[0].data);
    }
    return {
      ...execucao,
      etapas: etapas || [],
      detalhesDisponiveis: etapas !== undefined,
    };
  }
  async fechar(): Promise<void> {
    await this.pool.end();
  }
  private async detalharFollowup(id: string): Promise<DetalheExecucao | null> {
    const r = await this.pool.query(
      `SELECT id,status,iniciado_em,finalizado_em,padroes_utilizados,motivo
      FROM automacao_infra.followup_rodada WHERE id=$1`,
      [id.slice(3)],
    );
    const rodada = r.rows[0];
    if (!rodada) return null;
    const passos = await this.pool.query(
      `SELECT resultado,count(*)::int AS quantidade,sum(duracao_ms)::int AS duracao
      FROM automacao_infra.followup_etapa WHERE rodada_id=$1 GROUP BY resultado ORDER BY resultado`,
      [id.slice(3)],
    );
    const etapas: DetalheExecucao["etapas"] = passos.rows.map((p) => ({
      nome: `${p.resultado} (${p.quantidade})`,
      duracaoMs: p.duracao,
      tentativas: 1,
      status: /FALHA|INCERTO|PENDENTE/.test(p.resultado) ? "erro" : "sucesso",
    }));
    if (rodada.motivo)
      etapas.push({
        nome: rodada.motivo,
        status: "erro",
        duracaoMs: 0,
        tentativas: 1,
      });
    for (const chave of rodada.padroes_utilizados)
      etapas.push({
        nome: "PADRAO_UTILIZADO: " + chave,
        status: "sucesso",
        duracaoMs: 0,
        tentativas: 1,
      });
    return {
      id,
      fluxoId: "followup-typescript",
      fluxoNome: "Follow-up TypeScript",
      status: rodada.status,
      iniciadoEm: rodada.iniciado_em.toISOString(),
      finalizadoEm: rodada.finalizado_em?.toISOString() || null,
      modo: "schedule",
      etapas,
      detalhesDisponiveis: true,
    };
  }
}
