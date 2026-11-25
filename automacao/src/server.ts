import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { criarAplicacao } from "./app.js";
import { carregarConfiguracao } from "./config.js";
import { carregarBanco } from "./operacao/configuracao.js";
import { RepositorioExecucoesPostgres } from "./operacao/postgres.js";
import { IdentidadeCrm } from "./operacao/identidade.js";
import { carregarFollowup } from "./followup/configuracao.js";
import { RuntimeFollowup } from "./followup/runtime.js";
import { RuntimeSistematicas } from "./sistematicas/runtime.js";

const arquivoEnv = resolve(process.cwd(), ".env");
if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const configuracao = carregarConfiguracao(process.env);
const banco = carregarBanco(process.env);
const repositorio = banco ? new RepositorioExecucoesPostgres(banco) : undefined;
const followupConfig = configuracao.followUpHabilitado
  ? carregarFollowup(process.env)
  : undefined;
if (followupConfig && !banco) throw new Error("FOLLOWUP_EXIGE_BANCO_AUTOMACAO");
if (followupConfig && banco?.schema !== "public")
  throw new Error("FOLLOWUP_EXIGE_SCHEMA_PUBLIC_DOS_CONTROLES_COMPARTILHADOS");
let followup: RuntimeFollowup | undefined;
let sistematicas: RuntimeSistematicas | undefined;
const ativarSistematicas = configuracao.automacaoHabilitada && process.env.AUTOMACAO_SISTEMATICAS_HABILITADAS === "true";
if (ativarSistematicas && !banco) throw new Error("SISTEMATICAS_EXIGEM_BANCO");
const crmUrl =
  process.env.AUTOMACAO_CRM_URL ||
  (process.env.SYNAPSE_DOMINIO
    ? "https://" + process.env.SYNAPSE_DOMINIO
    : undefined);
if (
  process.env.NODE_ENV === "production" &&
  process.env.AUTOMACAO_PAINEL_COOKIE_SECURE === "false"
)
  throw new Error("COOKIE_SEGURO_OBRIGATORIO_EM_PRODUCAO");
const app = criarAplicacao(
  configuracao,
  {
    repositorio,
    token: process.env.AUTOMACAO_TOKEN,
    executorDisponivel: () => followup?.estado() === true,
    sistematicasHabilitadas: () => ativarSistematicas,
    sistematicasDisponiveis: () => sistematicas !== undefined,
  },
  {
    identidade: crmUrl ? new IdentidadeCrm(crmUrl) : undefined,
    cookieSeguro: process.env.AUTOMACAO_PAINEL_COOKIE_SECURE !== "false",
    raizArquivos: resolve(process.cwd(), "painel-dist"),
  },
);
let novaTentativa: NodeJS.Timeout | undefined;
let encerrando = false;
async function prepararBanco(): Promise<void> {
  if (!repositorio || encerrando) return;
  try {
    await repositorio.preparar();
    if (followupConfig && banco && !encerrando && !followup) {
      const candidato = new RuntimeFollowup(banco, followupConfig, (codigo) =>
        app.log.warn({ codigo }),
      );
      try {
        await candidato.iniciar();
        if (encerrando) await candidato.fechar();
        else followup = candidato;
      } catch (error) {
        await candidato.fechar();
        throw error;
      }
    }
    if (ativarSistematicas && banco && !encerrando && !sistematicas) {
      const candidato = new RuntimeSistematicas(banco, process.env, codigo => app.log.warn({ codigo }));
      try {
        await candidato.iniciar();
        if (encerrando) await candidato.fechar();
        else sistematicas = candidato;
      } catch (erro) {
        await candidato.fechar();
        throw erro;
      }
    }
    app.log.info({ codigo: "BANCO_AUTOMACAO_PRONTO" });
  } catch {
    app.log.warn({ codigo: "BANCO_AUTOMACAO_AGUARDANDO_PROVISIONAMENTO" });
    if (!encerrando) {
      novaTentativa = setTimeout(() => {
        void prepararBanco();
      }, 10000);
      novaTentativa.unref();
    }
  }
}
app.addHook("onReady", async () => {
  void prepararBanco();
});
app.addHook("onClose", async () => {
  encerrando = true;
  if (novaTentativa) clearTimeout(novaTentativa);
  await followup?.fechar();
  await sistematicas?.fechar();
  await repositorio?.fechar();
});

// O Docker envia SIGTERM no redeploy. Fechar o Fastify drena requisicoes em curso.
for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.once(sinal, () => {
    app.close().catch((error: unknown) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: configuracao.host, port: configuracao.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
