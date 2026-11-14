import { cookies } from "next/headers";

import { obterUrlApiServidor } from "@/lib/api/server-api-url";
import { NOME_COOKIE_PERSISTENCIA_SESSAO, NOME_COOKIE_REFRESH } from "./constants";
import { opcoesCookieRefresh } from "./cookie-refresh";

type Cookies = Awaited<ReturnType<typeof cookies>>;
export interface SessaoBackend {
  accessToken: string;
  refreshToken: string;
  expiraEmSegundos: number;
}
interface Conta {
  id: string;
  nome: string;
  papel: string;
  persistente: boolean;
}

const ATIVA = "synapse_conta_ativa";
const PREFIXO_TOKEN = "synapse_conta_refresh_";
const PREFIXO_CONTA = "synapse_conta_perfil_";
const LIMITE_CONTAS = 4;
const idValido = (id: unknown): id is string =>
  typeof id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);

export function identidadeDaSessao(accessToken: string) {
  try {
    const { sub, papel } = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
    if (idValido(sub)) return { id: sub, papel: typeof papel === "string" ? papel : "" };
  } catch {
    return null;
  }
  return null;
}

export function tokenDaConta(store: Cookies, id: string) {
  return store.get(PREFIXO_TOKEN + id)?.value;
}

export function lerConta(store: Cookies, id: unknown): Conta | null {
  if (!idValido(id) || !tokenDaConta(store, id)) return null;
  try {
    const conta: Conta = JSON.parse(decodeURIComponent(store.get(PREFIXO_CONTA + id)?.value ?? ""));
    return conta.id === id && typeof conta.nome === "string" && typeof conta.papel === "string"
      && typeof conta.persistente === "boolean" ? conta : null;
  } catch {
    return null;
  }
}

export function listarContas(store: Cookies): Conta[] {
  return store.getAll().filter(({ name }) => name.startsWith(PREFIXO_CONTA))
    .flatMap(({ name }) => lerConta(store, name.slice(PREFIXO_CONTA.length)) ?? []);
}

export function sessaoAtiva(store: Cookies) {
  const id = store.get(ATIVA)?.value;
  if (idValido(id)) {
    const conta = lerConta(store, id);
    return { conta, refreshToken: conta ? tokenDaConta(store, id) : undefined,
      persistente: conta?.persistente ?? false };
  }
  return { conta: null, refreshToken: store.get(NOME_COOKIE_REFRESH)?.value,
    persistente: store.get(NOME_COOKIE_PERSISTENCIA_SESSAO)?.value !== "0" };
}

export function removerConta(store: Cookies, id: string) {
  store.delete(PREFIXO_TOKEN + id);
  store.delete(PREFIXO_CONTA + id);
}

export function removerSessaoAtiva(store: Cookies) {
  const id = store.get(ATIVA)?.value;
  if (idValido(id)) {
    removerConta(store, id);
    store.delete(ATIVA);
  }
  store.delete(NOME_COOKIE_REFRESH);
  store.delete(NOME_COOKIE_PERSISTENCIA_SESSAO);
}

export function gravarSessao(store: Cookies, sessao: SessaoBackend, persistente: boolean, conta: Conta | null, ativar: boolean) {
  const opcoes = opcoesCookieRefresh(persistente);
  if (!conta) {
    store.set(NOME_COOKIE_REFRESH, sessao.refreshToken, opcoes);
    store.set(NOME_COOKIE_PERSISTENCIA_SESSAO, persistente ? "1" : "0", opcoes);
    return;
  }
  store.set(PREFIXO_TOKEN + conta.id, sessao.refreshToken, opcoes);
  store.set(PREFIXO_CONTA + conta.id, encodeURIComponent(JSON.stringify(conta)), opcoes);
  if (ativar) {
    store.set(ATIVA, conta.id, opcoes);
    if (store.get(NOME_COOKIE_REFRESH)) store.delete(NOME_COOKIE_REFRESH);
    if (store.get(NOME_COOKIE_PERSISTENCIA_SESSAO)) store.delete(NOME_COOKIE_PERSISTENCIA_SESSAO);
  }
}

export async function cadastrarConta(store: Cookies, sessao: SessaoBackend, persistente: boolean, email?: string) {
  const identidade = identidadeDaSessao(sessao.accessToken);
  if (!identidade) return gravarSessao(store, sessao, persistente, null, true);

  const resposta = await fetch(obterUrlApiServidor() + "/api/v1/me", {
    headers: { Authorization: "Bearer " + sessao.accessToken },
    signal: AbortSignal.timeout(2500),
    cache: "no-store",
  }).catch(() => null);
  const perfil = resposta?.ok ? await resposta.json().catch(() => null) : null;
  const nome = typeof perfil?.nome === "string" ? perfil.nome : (email ?? identidade.papel);
  const contas = listarContas(store).filter(({ id }) => id !== identidade.id);
  for (const { id } of contas.slice(0, Math.max(0, contas.length - LIMITE_CONTAS + 1))) removerConta(store, id);
  gravarSessao(store, sessao, persistente, { ...identidade, nome: nome.slice(0, 160), persistente }, true);
}

export async function renovarNoBackend(refreshToken: string) {
  return fetch(obterUrlApiServidor() + "/api/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);
}
