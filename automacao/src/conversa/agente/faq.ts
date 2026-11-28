import { Pool } from "pg";

export interface CatalogoFaq {
  listarAtivas():Promise<{categoria:string;pergunta:string;resposta:string}[]>;
}

// Fonte transitoria do EV-01. Esta tabela nao possui coluna ativo:
// cada linha cadastrada participa da consulta, na ordem do fluxo original.
export class FaqPostgres implements CatalogoFaq {
  private constructor(private readonly banco:Pool) {}
  static doCrm(env:NodeJS.ProcessEnv, avisar:(codigo:string)=>void) {
    if (!env.POSTGRES_DB || !env.POSTGRES_USER || !env.POSTGRES_PASSWORD ||
        env.POSTGRES_DB===env.AUTOMACAO_DB_NAME || env.POSTGRES_DB===env.N8N_DB_NAME)
      throw new Error("CONFIG_FAQ_CRM_INVALIDA");
    const pool = new Pool({host:env.POSTGRES_HOST || "postgres",port:Number(env.POSTGRES_PORT || 5432),
      database:env.POSTGRES_DB,user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,
      max:1,statement_timeout:10000,connectionTimeoutMillis:5000});
    pool.on("error",()=>avisar("FAQ_CRM_INDISPONIVEL"));
    return new FaqPostgres(pool);
  }
  fechar() { return this.banco.end(); }
  async listarAtivas() {
    const r = await this.banco.query<{categoria:string;pergunta:string;resposta:string}>(
      "SELECT nome AS categoria, pergunta, resposta FROM public.faq ORDER BY id");
    return r.rows;
  }
}
