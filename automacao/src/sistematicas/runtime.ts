import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import type { ConfiguracaoBanco } from "../operacao/configuracao.js";
import { carregarCanal } from "../followup/configuracao.js";
import { HttpJson } from "../followup/http.js";
import { carregarRestricaoNumeros } from "../compartilhado/restricao-numeros.js";
import { criarCanal } from "./canal.js";
import { CrmSistematicas } from "./crm.js";
import { LeadsCrm } from "./leads.js";
import { RodadaSistematica } from "./rodada.js";

export class RuntimeSistematicas {
  private readonly db: Pool;
  private readonly crmDb: Pool;
  private readonly fila: PgBoss;
  private readonly rodada: RodadaSistematica;
  constructor(banco: ConfiguracaoBanco, env: NodeJS.ProcessEnv, avisar: (codigo: string) => void) {
    const restricao = carregarRestricaoNumeros(env);
    const numeros = restricao.habilitada ? new Set(restricao.numeros) : null;
    const canal = carregarCanal(env);
    if (!env.SYNAPSE_TOKEN_INTERNO || !env.POSTGRES_DB || !env.POSTGRES_USER || !env.POSTGRES_PASSWORD)
      throw new Error("CONFIG_CRM_SISTEMATICAS_AUSENTE");
    const fuso = env.SYNAPSE_TIMEZONE || env.TZ || "America/Sao_Paulo";
    new Intl.DateTimeFormat("pt-BR", { timeZone: fuso });
    const http = new HttpJson(10000);
    this.db = new Pool({ ...banco, max: 3, statement_timeout: 15000, connectionTimeoutMillis: 5000 });
    this.crmDb = new Pool({ host: env.POSTGRES_HOST || "postgres", port: Number(env.POSTGRES_PORT || 5432),
      database: env.POSTGRES_DB, user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD,
      max: 1, statement_timeout: 15000, connectionTimeoutMillis: 5000 });
    this.db.on("error", () => avisar("BANCO_SISTEMATICAS_INDISPONIVEL"));
    this.crmDb.on("error", () => avisar("CRM_SISTEMATICAS_INDISPONIVEL"));
    this.fila = new PgBoss({ schema: "automacao_fila", db: { executeSql: (s,v) => this.db.query(s,v) } });
    this.fila.on("error", () => avisar("FILA_SISTEMATICAS_INDISPONIVEL"));
    this.rodada = new RodadaSistematica(this.db,
      new CrmSistematicas((env.AUTOMACAO_CRM_URL || "http://synapse-backend-internal:8080").replace(/\/$/, ""), env.SYNAPSE_TOKEN_INTERNO, http),
      new LeadsCrm(this.crmDb), criarCanal(canal, new HttpJson(10000)), numeros, fuso, canal.tipo === "meta");
  }
  async iniciar() {
    await this.fila.start();
    await this.fila.createQueue("sistematicas-hora", { policy: "singleton", retryLimit: 0, expireInSeconds: 3600 });
    await this.fila.work("sistematicas-hora", { localConcurrency: 1 }, async () => this.rodada.executar());
    await this.fila.schedule("sistematicas-hora", "0 * * * *");
  }
  async fechar() {
    try { await this.fila.stop({ graceful: true, timeout: 60000 }); }
    finally { await this.crmDb.end(); await this.db.end(); }
  }
}
