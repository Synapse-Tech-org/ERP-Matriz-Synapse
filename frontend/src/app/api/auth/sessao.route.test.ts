import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_AGE_COOKIE_REFRESH_SEGUNDOS,
  NOME_COOKIE_PERSISTENCIA_SESSAO,
  NOME_COOKIE_REFRESH,
} from "@/lib/auth/constants";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/api/server-api-url", () => ({ obterUrlApiServidor: () => "http://api-interna" }));

import { GET as contas, POST as trocar } from "./contas/route";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { POST as refresh } from "./refresh/route";

function requisicaoLogin(manterSessaoAtiva: boolean) {
  return new Request("http://crm.local/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ana@empresa.test", senha: "senha", manterSessaoAtiva }),
  });
}

function respostaDeSessao() {
  return {
    ok: true,
    json: async () => ({
      accessToken: "access-token",
      refreshToken: "refresh-token-novo",
      expiraEmSegundos: 900,
    }),
  };
}

describe("Route Handlers de sessão", () => {
  const set = vi.fn();
  const deleteCookie = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaDeSessao()));
    set.mockReset();
    deleteCookie.mockReset();
    cookiesMock.mockResolvedValue({
      get: vi.fn(),
      set,
      delete: deleteCookie,
    });
  });

  it.each([502, 503, 504])("refresh HTTP %s preserva cookies; não é sessão recusada", async (status) => {
    cookiesMock.mockResolvedValue({ get: () => ({ value: "token-sintetico" }), set, delete: deleteCookie });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    expect((await refresh()).status).toBe(status);
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it("falha de transporte retorna 503 sanitizado e preserva cookies", async () => {
    cookiesMock.mockResolvedValue({ get: () => ({ value: "token-sintetico" }), set, delete: deleteCookie });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("URL privada / token")));
    const resposta = await refresh();
    expect(resposta.status).toBe(503);
    expect(await resposta.json()).toEqual({ type: "about:blank", title: "Sistema temporariamente indisponível", status: 503 });
    expect(resposta.headers.get("Content-Type")).toBe("application/problem+json");
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it.each([401, 403])("refresh HTTP %s mantém recusa e remove a sessão", async (status) => {
    cookiesMock.mockResolvedValue({ get: () => ({ value: "token-sintetico" }), set, delete: deleteCookie });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    expect((await refresh()).status).toBe(status);
    expect(deleteCookie).toHaveBeenCalledTimes(2);
  });

  it("grava refresh persistente somente quando a caixa foi marcada", async () => {
    const resposta = await login(requisicaoLogin(true) as never);

    expect(fetch).toHaveBeenCalledWith(
      "http://api-interna/api/v1/auth/login",
      expect.objectContaining({ body: JSON.stringify({ email: "ana@empresa.test", senha: "senha" }) }),
    );
    expect(set).toHaveBeenNthCalledWith(
      1,
      NOME_COOKIE_REFRESH,
      "refresh-token-novo",
      expect.objectContaining({
        httpOnly: true,
        maxAge: MAX_AGE_COOKIE_REFRESH_SEGUNDOS,
      }),
    );
    expect(set).toHaveBeenNthCalledWith(
      2,
      NOME_COOKIE_PERSISTENCIA_SESSAO,
      "1",
      expect.objectContaining({ maxAge: MAX_AGE_COOKIE_REFRESH_SEGUNDOS }),
    );
    expect(await resposta.json()).toEqual({ accessToken: "access-token", expiraEmSegundos: 900 });
  });

  it("grava cookies de sessão quando a caixa fica desmarcada", async () => {
    await login(requisicaoLogin(false) as never);

    const opcoesRefresh = set.mock.calls[0][2] as Record<string, unknown>;
    const opcoesPreferencia = set.mock.calls[1][2] as Record<string, unknown>;
    expect(set.mock.calls[1].slice(0, 2)).toEqual([NOME_COOKIE_PERSISTENCIA_SESSAO, "0"]);
    expect(opcoesRefresh).not.toHaveProperty("maxAge");
    expect(opcoesRefresh).not.toHaveProperty("expires");
    expect(opcoesPreferencia).not.toHaveProperty("maxAge");
    expect(opcoesPreferencia).not.toHaveProperty("expires");
  });

  it("preserva cookie de sessão na rotação de refresh", async () => {
    cookiesMock.mockResolvedValue({
      get: vi.fn((nome: string) => {
        if (nome === NOME_COOKIE_REFRESH) return { value: "refresh-token-antigo" };
        if (nome === NOME_COOKIE_PERSISTENCIA_SESSAO) return { value: "0" };
        return undefined;
      }),
      set,
      delete: deleteCookie,
    });

    await refresh();

    const opcoesRefresh = set.mock.calls[0][2] as Record<string, unknown>;
    const opcoesPreferencia = set.mock.calls[1][2] as Record<string, unknown>;
    expect(opcoesRefresh).not.toHaveProperty("maxAge");
    expect(opcoesPreferencia).not.toHaveProperty("maxAge");
    expect(set.mock.calls[1].slice(0, 2)).toEqual([NOME_COOKIE_PERSISTENCIA_SESSAO, "0"]);
  });

  it("remove refresh e preferência no logout", async () => {
    cookiesMock.mockResolvedValue({
      get: vi.fn((nome: string) => (nome === NOME_COOKIE_REFRESH ? { value: "refresh-token" } : undefined)),
      set,
      delete: deleteCookie,
    });

    await logout();

    expect(deleteCookie).toHaveBeenCalledWith(NOME_COOKIE_REFRESH);
    expect(deleteCookie).toHaveBeenCalledWith(NOME_COOKIE_PERSISTENCIA_SESSAO);
  });
});

describe("troca de contas do navegador", () => {
  const ana = "a0000000-0000-4000-8000-000000000001";
  const bia = "a0000000-0000-4000-8000-000000000002";
  const jar = new Map<string, string>();

  function tokens(id: string, token: string) {
    return Response.json({
      accessToken: "jwt." + Buffer.from(JSON.stringify({ sub: id, papel: "ATENDENTE" })).toString("base64url") + ".assinatura",
      refreshToken: token,
      expiraEmSegundos: 900,
    });
  }

  function requisicaoTroca(id: string, origem = "same-origin") {
    return new Request("http://crm.local/api/auth/contas", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": origem },
      body: JSON.stringify({ id }),
    }) as never;
  }

  beforeEach(async () => {
    jar.clear();
    cookiesMock.mockResolvedValue({
      get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined,
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(tokens(ana, "sessao-ana"))
      .mockResolvedValueOnce(Response.json({ nome: "Ana" }))
      .mockResolvedValueOnce(tokens(bia, "sessao-bia"))
      .mockResolvedValueOnce(Response.json({ nome: "Bia" })));
    await login(requisicaoLogin(false) as never);
    await login(requisicaoLogin(true) as never);
  });

  it("lista só metadados da conta anterior e troca após o backend validar e rotacionar o token", async () => {
    expect(await (await contas()).json()).toEqual([{ id: ana, nome: "Ana", papel: "ATENDENTE" }]);
    vi.mocked(fetch).mockResolvedValueOnce(tokens(ana, "sessao-ana-rotacionada"));
    expect((await trocar(requisicaoTroca(ana))).status).toBe(204);
    expect(fetch).toHaveBeenLastCalledWith("http://api-interna/api/v1/auth/refresh",
      expect.objectContaining({ body: JSON.stringify({ refreshToken: "sessao-ana" }) }));
    expect(await (await contas()).json()).toEqual([{ id: bia, nome: "Bia", papel: "ATENDENTE" }]);
    vi.mocked(fetch).mockResolvedValueOnce(tokens(ana, "sessao-ana-rotacionada-de-novo"));
    expect((await refresh()).status).toBe(200);
    expect(fetch).toHaveBeenLastCalledWith("http://api-interna/api/v1/auth/refresh",
      expect.objectContaining({ body: JSON.stringify({ refreshToken: "sessao-ana-rotacionada" }) }));
  });

  it("recusa troca de outra origem e remove sessão expirada sem afetar a conta ativa", async () => {
    vi.mocked(fetch).mockClear();
    expect((await trocar(requisicaoTroca(ana, "cross-site"))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await trocar(requisicaoTroca(ana))).status).toBe(401);
    const lista = await contas();
    expect(lista.status).toBe(200);
    expect(await lista.json()).toEqual([]);
    expect((await trocar(requisicaoTroca(ana))).status).toBe(404);
  });
});
