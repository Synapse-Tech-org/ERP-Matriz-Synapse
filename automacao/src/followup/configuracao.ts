import type { ConfiguracaoBanco } from "../operacao/configuracao.js";
import type { OpcoesRegras } from "./configuracao-crm.js";
import { PADROES_FOLLOWUP as P } from "./padroes.js";
import type { ConfiguracaoProvedor } from "./provedores.js";

export interface ConfiguracaoFollowup {
  intervaloMinutos: number;
  pagina: number;
  retencaoDias: number;
  timeoutMs: number;
  crmBase: string;
  crmToken: string;
  crmBanco: ConfiguracaoBanco;
  provedor: ConfiguracaoProvedor;
  regras: OpcoesRegras;
  restricao: { habilitada: boolean; numeros: string[] };
}

function inteiro(
  valor: string | undefined,
  padrao: number,
  maximo: number,
): number {
  if (!valor) return padrao;
  if (!/^\d+$/.test(valor) || Number(valor) < 1 || Number(valor) > maximo)
    throw new Error("ENV_FOLLOWUP_INTEIRO_INVALIDO");
  return Number(valor);
}
function obrigatoria(env: NodeJS.ProcessEnv, chave: string): string {
  const valor = env[chave]?.trim();
  if (!valor) throw new Error("ENV_OBRIGATORIA: " + chave);
  return valor;
}
function booleano(valor: string | undefined, padrao = false): boolean {
  if (!valor) return padrao;
  if (valor !== "true" && valor !== "false")
    throw new Error("ENV_FOLLOWUP_BOOLEANO_INVALIDO");
  return valor === "true";
}
function url(valor: string): string {
  const u = new URL(valor);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error("URL_FOLLOWUP_INVALIDA");
  return valor.replace(/\/$/, "");
}

// So e chamada quando os DOIS toggles estao ligados. Filhos que nao usam
// follow-up nao precisam cadastrar segredos dos provedores nem do worker.
export function carregarFollowup(env: NodeJS.ProcessEnv): ConfiguracaoFollowup {
  const nomeProvedor = obrigatoria(env, "WHATSAPP_PROVEDOR");
  const tipo = nomeProvedor === "meta-cloud" ? "meta" : nomeProvedor;
  let provedor: ConfiguracaoProvedor;
  if (tipo === "evolution") {
    if (!booleano(env.EVOLUTION_HABILITADO))
      throw new Error("EVOLUTION_DESLIGADA");
    provedor = {
      tipo,
      base: url(obrigatoria(env, "EVOLUTION_URL_BASE")),
      instancia: obrigatoria(env, "EVOLUTION_INSTANCIA"),
      token: obrigatoria(env, "EVOLUTION_API_KEY"),
    };
  } else if (tipo === "z-api") {
    if (!booleano(env.Z_API_HABILITADO)) throw new Error("Z_API_DESLIGADA");
    provedor = {
      tipo,
      base: url(env.Z_API_URL_BASE || "https://api.z-api.io"),
      instancia: obrigatoria(env, "Z_API_INSTANCIA_ID"),
      token: obrigatoria(env, "Z_API_TOKEN"),
      clientToken: booleano(env.Z_API_ENVIAR_CLIENT_TOKEN, true)
        ? obrigatoria(env, "Z_API_CLIENT_TOKEN")
        : "",
    };
  } else if (tipo === "meta") {
    provedor = {
      tipo,
      base: url(env.WHATSAPP_URL_BASE || "https://graph.facebook.com/v21.0"),
      numero: obrigatoria(env, "WHATSAPP_NUMERO"),
      token: obrigatoria(env, "WHATSAPP_TOKEN"),
    };
  } else throw new Error("PROVEDOR_FOLLOWUP_NAO_SUPORTADO");
  const regras: OpcoesRegras = { exigeJanela: tipo === "meta" };
  if (env.AUTOMACAO_FOLLOWUP_BOTAO_SIM_ID)
    regras.botaoSimId = env.AUTOMACAO_FOLLOWUP_BOTAO_SIM_ID;
  if (env.AUTOMACAO_FOLLOWUP_BOTAO_NAO_ID)
    regras.botaoNaoId = env.AUTOMACAO_FOLLOWUP_BOTAO_NAO_ID;
  if (booleano(env.AUTOMACAO_FOLLOWUP_TESTE_LOCAL_HABILITADO)) {
    const leadId = obrigatoria(env, "AUTOMACAO_FOLLOWUP_TESTE_LEAD_ID");
    if (!/^[a-f0-9-]{36}$/i.test(leadId))
      throw new Error("LEAD_TESTE_INVALIDO");
    regras.teste = {
      leadId,
      regra: {
        id: "teste-local",
        nome: "Teste local",
        tempoMinutos: inteiro(env.AUTOMACAO_FOLLOWUP_TESTE_MINUTOS, 10, 1440),
        texto: obrigatoria(env, "AUTOMACAO_FOLLOWUP_TESTE_TEXTO"),
      },
    };
  }
  return {
    intervaloMinutos: inteiro(
      env.AUTOMACAO_FOLLOWUP_INTERVALO_MINUTOS,
      P.intervaloMinutos,
      1440,
    ),
    pagina: inteiro(
      env.AUTOMACAO_FOLLOWUP_TAMANHO_PAGINA,
      P.tamanhoPagina,
      1000,
    ),
    retencaoDias: inteiro(
      env.AUTOMACAO_FOLLOWUP_RETENCAO_DIAS,
      P.retencaoDias,
      3650,
    ),
    timeoutMs: inteiro(
      env.AUTOMACAO_FOLLOWUP_HTTP_TIMEOUT_MS,
      P.timeoutHttpMs,
      60000,
    ),
    crmBase: url(
      env.AUTOMACAO_CRM_URL || "http://synapse-backend-internal:8080",
    ),
    crmToken: obrigatoria(env, "SYNAPSE_TOKEN_INTERNO"),
    crmBanco: {
      host: env.POSTGRES_HOST || "postgres",
      port: inteiro(env.POSTGRES_PORT, 5432, 65535),
      database: obrigatoria(env, "POSTGRES_DB"),
      user: obrigatoria(env, "POSTGRES_USER"),
      password: obrigatoria(env, "POSTGRES_PASSWORD"),
      max: 2,
      schema: "public",
    },
    provedor,
    regras,
    restricao: {
      habilitada: booleano(env.WHATSAPP_RESTRICAO_NUMEROS_HABILITADA, true),
      numeros: (env.WHATSAPP_NUMEROS_PERMITIDOS || "")
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map((n) => n.replace(/\D/g, "")),
    },
  };
}
