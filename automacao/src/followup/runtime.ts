import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import type { ConfiguracaoBanco } from "../operacao/configuracao.js";
import type { ConfiguracaoFollowup } from "./configuracao.js";
import { HttpJson } from "./http.js";
import { CrmHttpFollowup } from "./crm-http.js";
import { WhatsAppFollowup } from "./provedores.js";
import { AtendimentosPostgres } from "./atendimentos-postgres.js";
import { ControlePostgres } from "./controle-postgres.js";
import { ProcessarAtendimento } from "./processar-atendimento.js";
import { ExecutarRodada } from "./rodada.js";

export class RuntimeFollowup {
  private readonly pool: Pool;
  private readonly poolCrm: Pool;
  private readonly boss: PgBoss;
  private readonly rodada: ExecutarRodada;
  private encerrando = false;
  private iniciado = false;
  private disponivel = false;

  constructor(
    banco: ConfiguracaoBanco,
    config: ConfiguracaoFollowup,
    private readonly avisar: (codigo: string) => void,
  ) {
    // Um slot segura a coordenacao; dois atendem os candidatos. Pool do CRM e separado.
    this.pool = new Pool({
      ...banco,
      max: Math.max(3, banco.max),
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });
    this.poolCrm = new Pool({
      ...config.crmBanco,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    this.pool.on("error", () => {
      this.disponivel = false;
      this.avisar("BANCO_FOLLOWUP_INDISPONIVEL");
    });
    this.poolCrm.on("error", () => this.avisar("BANCO_CRM_INDISPONIVEL"));
    this.boss = new PgBoss({
      schema: "automacao_fila",
      db: {
        executeSql: (sql, values) => this.pool.query(sql, values),
      },
    });
    this.boss.on("error", () => {
      this.disponivel = false;
      this.avisar("FILA_FOLLOWUP_INDISPONIVEL");
    });
    const crm = new CrmHttpFollowup(
      config.crmBase,
      config.crmToken,
      new HttpJson(config.timeoutMs),
      config.regras,
    );
    const consulta = new AtendimentosPostgres(this.poolCrm);
    const processador = new ProcessarAtendimento(
      consulta,
      new ControlePostgres(this.pool),
      crm,
      new WhatsAppFollowup(
        config.provedor,
        new HttpJson(config.timeoutMs),
        config.restricao,
      ),
    );
    this.rodada = new ExecutarRodada(
      this.pool,
      consulta,
      crm,
      processador,
      config,
      () => this.encerrando,
    );
  }
  estado(): boolean {
    return this.disponivel && !this.encerrando;
  }
  async iniciar(): Promise<void> {
    if (this.iniciado) return;
    await this.boss.start();
    await this.boss.createQueue("followup-rodada", {
      retryLimit: 2,
      retryDelay: 60,
      expireInSeconds: 3600,
    });
    await this.boss.work(
      "followup-rodada",
      { localConcurrency: 1 },
      async (jobs) => {
        for (const job of jobs) {
          if (!this.encerrando) await this.rodada.executar(job.id);
        }
        this.disponivel = true;
      },
    );
    // Pulso de um minuto, com intervalo real validado no banco. Aceita 7, 90, etc.
    // sem a irregularidade de um cron */N quando N nao divide uma hora.
    await this.boss.schedule("followup-rodada", "* * * * *");
    this.iniciado = true;
    this.disponivel = true;
  }
  async fechar(): Promise<void> {
    this.encerrando = true;
    await this.boss.stop({ graceful: true, timeout: 60000 });
    await this.poolCrm.end();
    await this.pool.end();
  }
}
