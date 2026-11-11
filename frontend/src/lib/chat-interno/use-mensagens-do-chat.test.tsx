import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listarMensagensChat: vi.fn() }));
vi.mock("./api", () => api);

import type { ChatMensagem, PaginaChatMensagens } from "./types";
import { chaveMensagensDoChat, useMensagensDoChat } from "./use-mensagens-do-chat";

const TAMANHO_DA_PAGINA = 3;

function mensagem(ordem: number, conversaId = "c1"): ChatMensagem {
  const minuto = String(ordem).padStart(2, "0");
  return {
    id: `m-${minuto}`,
    conversaId,
    remetenteId: "u1",
    remetenteNome: "Gustavo",
    conteudo: `mensagem ${ordem}`,
    enviadoEm: `2026-10-27T10:${minuto}:00.000Z`,
  };
}

/** Espelha ChatInternoRepositorioJdbc.listarMensagens: as mais recentes primeiro, página em ordem cronológica. */
function servidor(todas: () => ChatMensagem[]) {
  return async (_conversaId: string, antesDe?: string | null): Promise<PaginaChatMensagens> => {
    const candidatas = todas()
      .filter((item) => !antesDe || item.enviadoEm < antesDe)
      .sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm))
      .slice(0, TAMANHO_DA_PAGINA);
    const cheia = candidatas.length === TAMANHO_DA_PAGINA;
    return {
      mensagens: [...candidatas].reverse(),
      proximoCursor: cheia ? candidatas[candidatas.length - 1].enviadoEm : null,
    };
  };
}

function montar(conversaId: string | null) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
  const hook = renderHook((p: { id: string | null }) => useMensagensDoChat(p.id), {
    wrapper,
    initialProps: { id: conversaId },
  });
  return { cliente, ...hook };
}

const ids = (lista: ChatMensagem[]) => lista.map((item) => item.id);

describe("useMensagensDoChat", () => {
  let historico: ChatMensagem[];

  beforeEach(() => {
    historico = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => mensagem(n));
    api.listarMensagensChat.mockReset().mockImplementation(servidor(() => historico));
  });

  it("primeira carga: só a página mais recente, em ordem cronológica, sem cursor na chamada", async () => {
    const { result } = montar("c1");

    await waitFor(() => expect(result.current.mensagens).toHaveLength(3));
    expect(ids(result.current.mensagens)).toEqual(["m-06", "m-07", "m-08"]);
    expect(result.current.temMais).toBe(true);
    expect(api.listarMensagensChat).toHaveBeenCalledTimes(1);
    expect(api.listarMensagensChat).toHaveBeenCalledWith("c1");
  });

  it("carregarMais busca as anteriores com o cursor e as põe antes, sem repetir nem perder nenhuma", async () => {
    const { result } = montar("c1");
    await waitFor(() => expect(result.current.mensagens).toHaveLength(3));

    await act(async () => result.current.carregarMais());
    await waitFor(() => expect(result.current.mensagens).toHaveLength(6));
    expect(ids(result.current.mensagens)).toEqual(["m-03", "m-04", "m-05", "m-06", "m-07", "m-08"]);
    expect(api.listarMensagensChat).toHaveBeenLastCalledWith("c1", "2026-10-27T10:06:00.000Z");

    await act(async () => result.current.carregarMais());
    await waitFor(() => expect(result.current.mensagens).toHaveLength(8));
    expect(ids(result.current.mensagens)).toEqual(
      ["m-01", "m-02", "m-03", "m-04", "m-05", "m-06", "m-07", "m-08"],
    );
  });

  it("carregandoMais fica verdadeiro só enquanto a página anterior é buscada", async () => {
    const { result } = montar("c1");
    await waitFor(() => expect(result.current.mensagens).toHaveLength(3));
    const original = api.listarMensagensChat.getMockImplementation()!;
    let liberar!: () => void;
    api.listarMensagensChat.mockImplementation(async (id: string, antesDe?: string | null) => {
      await new Promise<void>((resolver) => {
        liberar = resolver;
      });
      return original(id, antesDe);
    });

    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.carregandoMais).toBe(true));
    act(() => result.current.carregarMais());
    expect(api.listarMensagensChat).toHaveBeenCalledTimes(2);

    await act(async () => liberar());
    await waitFor(() => expect(result.current.carregandoMais).toBe(false));
    expect(result.current.mensagens).toHaveLength(6);
  });

  it("trocar de conversa com um carregamento em andamento não deixa o indicador preso na nova", async () => {
    const outra = [mensagem(1, "c2"), mensagem(2, "c2")];
    const original = servidor(() => historico);
    let liberar!: () => void;
    api.listarMensagensChat.mockImplementation(async (id: string, antesDe?: string | null) => {
      if (id === "c2") return servidor(() => outra)(id, antesDe);
      if (antesDe) {
        await new Promise<void>((resolver) => {
          liberar = resolver;
        });
      }
      return original(id, antesDe);
    });
    const { result, rerender } = montar("c1");
    await waitFor(() => expect(result.current.mensagens).toHaveLength(3));
    act(() => result.current.carregarMais());
    await waitFor(() => expect(result.current.carregandoMais).toBe(true));

    rerender({ id: "c2" });
    await waitFor(() => expect(ids(result.current.mensagens)).toEqual(["m-01", "m-02"]));
    expect(result.current.carregandoMais).toBe(false);

    await act(async () => liberar());
    expect(ids(result.current.mensagens)).toEqual(["m-01", "m-02"]);
  });

  it("chegando ao começo da conversa, temMais é falso", async () => {
    historico = [mensagem(1), mensagem(2)];
    const { result } = montar("c1");

    await waitFor(() => expect(result.current.mensagens).toHaveLength(2));
    expect(result.current.temMais).toBe(false);
  });

  it("uma mensagem nova (refetch por tempo real) não deixa buraco entre as páginas já carregadas", async () => {
    const { result, cliente } = montar("c1");
    await waitFor(() => expect(result.current.mensagens).toHaveLength(3));
    await act(async () => result.current.carregarMais());
    await waitFor(() => expect(result.current.mensagens).toHaveLength(6));

    // A janela das mais recentes desliza: m-06 sai da primeira página e deve continuar visível.
    historico = [...historico, mensagem(9)];
    await act(async () => {
      await cliente.invalidateQueries({ queryKey: ["chat-interno"] });
    });

    await waitFor(() => expect(ids(result.current.mensagens)).toContain("m-09"));
    // Nada do que já estava na tela some (m-03 continua no topo) e não há buraco entre as páginas.
    // O refetch busca páginas inteiras, então pode trazer até o começo da página que contém m-03.
    const depois = ids(result.current.mensagens);
    expect(depois).toContain("m-03");
    expect(depois.at(-1)).toBe("m-09");
    expect(depois).toEqual([...depois].sort());
    expect(new Set(depois).size).toBe(depois.length);
    const primeira = Number(depois[0].slice(2));
    expect(depois).toEqual(Array.from({ length: 10 - primeira }, (_, i) => `m-0${primeira + i}`));
  });

  it("sem conversa aberta, não consulta nada", async () => {
    const { result } = montar(null);
    await act(async () => {
      await Promise.resolve();
    });

    expect(api.listarMensagensChat).not.toHaveBeenCalled();
    expect(result.current.mensagens).toEqual([]);
    expect(result.current.temMais).toBe(false);
  });

  it("trocar de conversa mostra só a nova, sem misturar o histórico da anterior", async () => {
    const outra = [mensagem(1, "c2"), mensagem(2, "c2")];
    api.listarMensagensChat.mockImplementation((conversaId: string, antesDe?: string | null) =>
      servidor(() => (conversaId === "c1" ? historico : outra))(conversaId, antesDe),
    );
    const { result, rerender } = montar("c1");
    await waitFor(() => expect(result.current.mensagens).toHaveLength(3));
    await act(async () => result.current.carregarMais());
    await waitFor(() => expect(result.current.mensagens).toHaveLength(6));

    rerender({ id: "c2" });

    await waitFor(() => expect(ids(result.current.mensagens)).toEqual(["m-01", "m-02"]));
    expect(result.current.mensagens.every((item) => item.conversaId === "c2")).toBe(true);
  });

  it("a chave de cache continua sendo a da conversa, para as reações em tempo real a encontrarem", () => {
    expect(chaveMensagensDoChat("c1")).toEqual(["chat-interno", "mensagens", "c1"]);
  });
});
