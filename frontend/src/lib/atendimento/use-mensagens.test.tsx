import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErroDeApi } from "@/lib/api/errors";

import { mensagensDesde, paginaMensagens } from "./api";
import type { DadosDoHistorico } from "./cache-mensagens";
import type { ConexaoTempoReal, EstadoConexao } from "./tempo-real";
import type { EventoTempoReal, MensagemResposta, NotificacaoTempoReal, PaginaMensagens } from "./types";
import { useMensagens } from "./use-mensagens";

vi.mock("./api", () => ({ mensagensDesde: vi.fn(), paginaMensagens: vi.fn() }));
vi.mock("./tempo-real", async (importOriginal) => ({
  ...await importOriginal<typeof import("./tempo-real")>(),
  calcularBackoffMs: vi.fn((indice: number) => (indice + 1) * 50),
}));

const PRIMEIRA = "2026-11-19T20:00:00.123456Z";
const ANTES_DA_PRIMEIRA = "2026-11-19T20:00:00.122Z";
const MAIS_NOVA = "2026-11-19T20:00:02Z";

function mensagem(id: string, enviadoEm = PRIMEIRA, atendimentoId = "chat-a"): MensagemResposta {
  return {
    id, atendimentoId, remetenteTipo: "LEAD", remetenteId: null, remetenteNome: null,
    tipo: "TEXTO", conteudo: id, midiaUrl: null, midiaMetadados: null, opcoes: null,
    statusEntrega: "ENVIADO", erroEntrega: null, enviadoEm, citacao: null, idempotencyKey: null,
  };
}

function adiar<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => { resolver = resolve; });
  return { promessa, resolver };
}

function montar(historico?: MensagemResposta[], estadoInicial: EstadoConexao = "desconectado") {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const chave = ["mensagens", "chat-a"] as const;
  if (historico) {
    cliente.setQueryData<DadosDoHistorico>(chave, {
      pages: [{ mensagens: historico, proximoCursor: null }], pageParams: [null],
    });
  }
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  }
  let receber!: (evento: EventoTempoReal) => void;
  let notificar: ((evento: NotificacaoTempoReal) => void) | undefined;
  const conexao = {
    abrirConversa: (_id: string, callback: (evento: EventoTempoReal) => void) => { receber = callback; },
    fecharConversa: vi.fn(),
    adicionarOuvinteDeNotificacao: (callback: (evento: NotificacaoTempoReal) => void) => {
      notificar = callback;
      return () => { notificar = undefined; };
    },
  } as unknown as ConexaoTempoReal;
  const acessoPerdido = vi.fn();
  const props = { atendimento: "chat-a" as string | null, estado: estadoInicial, ciclo: 1, liberado: false };
  const hook = renderHook(
    ({ atendimento, estado, ciclo, liberado }: typeof props) =>
      useMensagens(atendimento, conexao, estado, undefined, atendimento, undefined, undefined,
        liberado, ciclo, acessoPerdido),
    { wrapper: Wrapper, initialProps: props },
  );
  function chegar(nova: MensagemResposta, atendimentoId = "chat-a") {
    receber({ tipo: "MENSAGEM", dados: { ...nova, atendimentoId, leadId: "lead-a", mensagemId: nova.id } });
  }
  function reconectar(ciclo = 1) {
    hook.rerender({ ...props, ciclo, estado: "conectado", liberado: true });
  }
  function aviso(nova: MensagemResposta) {
    notificar?.({ tipo: "NOVA_MENSAGEM", dados: { ...nova, atendimentoId: nova.atendimentoId ?? "chat-a",
      leadId: "lead-a", leadNome: "Contato sintético", mensagemId: nova.id } });
  }
  function status(id: string, statusEntrega: MensagemResposta["statusEntrega"] = "ENTREGUE") {
    receber({ tipo: "STATUS", dados: { atendimentoId: "chat-a", leadId: "lead-a",
      mensagemId: id, statusEntrega, ocorridoEm: MAIS_NOVA } });
  }
  return { ...hook, cliente, chave, acessoPerdido, chegar, reconectar, props, status, aviso };
}

async function passar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe("recuperação autorizada do histórico de Atendimentos", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });

  it("não deixa GET atrasado apagar mensagem nem regredir status recebido no mesmo socket", async () => {
    const saida: MensagemResposta = { ...mensagem("saida"), remetenteTipo: "ATENDENTE", statusEntrega: "PENDENTE" };
    const nova = mensagem("nova", MAIS_NOVA);
    vi.mocked(mensagensDesde).mockResolvedValue([]);
    const tela = montar([saida], "conectado");
    tela.reconectar();
    const leitura = adiar<PaginaMensagens>();
    vi.mocked(paginaMensagens).mockReturnValueOnce(leitura.promessa);
    act(() => { void tela.result.current.refetch(); });
    await waitFor(() => expect(paginaMensagens).toHaveBeenCalledTimes(1));
    act(() => { tela.chegar(nova); tela.status(saida.id); });
    await waitFor(() => expect(tela.result.current.data).toEqual([
      expect.objectContaining({ id: saida.id, statusEntrega: "ENTREGUE" }),
      expect.objectContaining({ id: nova.id }),
    ]));

    await act(async () => leitura.resolver({ mensagens: [saida], proximoCursor: null }));
    await waitFor(() => expect(tela.result.current.isFetching).toBe(false));
    expect(tela.result.current.data).toEqual([
      expect.objectContaining({ id: saida.id, statusEntrega: "ENTREGUE" }),
      expect.objectContaining({ id: nova.id }),
    ]);
  });

  it("aplica status de mensagem antiga só após revalidar o acesso no mesmo ciclo", async () => {
    const antiga: MensagemResposta = { ...mensagem("saida"), remetenteTipo: "ATENDENTE", statusEntrega: "PENDENTE" };
    const maisNova = mensagem("recente", MAIS_NOVA);
    vi.mocked(mensagensDesde).mockResolvedValue([maisNova]);
    const tela = montar([antiga, maisNova], "conectado");
    act(() => tela.status(antiga.id));
    expect(tela.result.current.data[0].statusEntrega).toBe("PENDENTE");
    tela.reconectar();
    await waitFor(() => expect(tela.result.current.data[0].statusEntrega).toBe("ENTREGUE"));
  });

  it("recupera pelo aviso pessoal mesmo sem frame da conversa, sem duplicar se o frame chegar", async () => {
    vi.useFakeTimers();
    vi.mocked(mensagensDesde).mockResolvedValue([]);
    const inicial = mensagem("primeira");
    const perdida = mensagem("perdida", MAIS_NOVA);
    vi.mocked(paginaMensagens).mockResolvedValue({ mensagens: [inicial, perdida], proximoCursor: null });
    const tela = montar([inicial], "conectado");
    tela.reconectar();
    await passar(0);
    act(() => { tela.aviso(perdida); tela.aviso(perdida); tela.aviso(mensagem("outra", MAIS_NOVA, "chat-b")); });
    await passar(4_000);
    expect(paginaMensagens).toHaveBeenCalledTimes(1);
    expect(tela.result.current.data.map(({ id }) => id)).toEqual([inicial.id, perdida.id]);
    act(() => { tela.chegar(perdida); tela.aviso(perdida); });
    await passar(4_000);
    expect(paginaMensagens).toHaveBeenCalledTimes(1);
    expect(tela.result.current.data.map(({ id }) => id)).toEqual([inicial.id, perdida.id]);
  });

  it("espera autorização e não relê o histórico se o próprio frame já cobriu o aviso", async () => {
    vi.useFakeTimers();
    vi.mocked(mensagensDesde).mockResolvedValue([]);
    const nova = mensagem("ao-vivo", MAIS_NOVA);
    const tela = montar([mensagem("inicial")], "conectado");
    act(() => tela.aviso(nova));
    await passar(3_000);
    expect(paginaMensagens).not.toHaveBeenCalled();
    tela.reconectar();
    act(() => tela.chegar(nova));
    await passar(3_000);
    expect(paginaMensagens).not.toHaveBeenCalled();
    expect(tela.result.current.data.map(({ id }) => id)).toEqual(["inicial", "ao-vivo"]);
  });

  it.each([false, true])("cancela recuperação por aviso na troca ou na revogação (%s)", async (revogar) => {
    vi.useFakeTimers();
    vi.mocked(mensagensDesde).mockResolvedValue([]);
    const pendente = adiar<PaginaMensagens>();
    vi.mocked(paginaMensagens).mockReturnValueOnce(pendente.promessa)
      .mockResolvedValue({ mensagens: [mensagem("de-b", PRIMEIRA, "chat-b")], proximoCursor: null });
    const inicial = mensagem("inicial");
    const tela = montar([inicial], "conectado");
    tela.reconectar();
    act(() => tela.aviso(mensagem("restrita", MAIS_NOVA)));
    await passar(3_000);
    const signal = vi.mocked(paginaMensagens).mock.calls[0][2];
    expect(signal?.aborted).toBe(false);
    if (revogar) {
      act(() => tela.cliente.removeQueries({ queryKey: tela.chave, exact: true }));
    } else {
      tela.rerender({ ...tela.props, atendimento: "chat-b", estado: "conectado", liberado: false });
    }
    expect(signal?.aborted).toBe(true);
    await act(async () => pendente.resolver({ mensagens: [mensagem("restrita", MAIS_NOVA)], proximoCursor: null }));
    await passar(0);
    expect(tela.cliente.getQueryData<DadosDoHistorico>(tela.chave)?.pages[0].mensagens)
      .toEqual(revogar ? undefined : [inicial]);
    if (!revogar) expect(tela.result.current.data.map(({ id }) => id)).toEqual(["de-b"]);
  });

  it.each([403, 404])("encerra histórico e ignora frames após recusa %s na recuperação por aviso", async (erro) => {
    vi.useFakeTimers();
    vi.mocked(mensagensDesde).mockResolvedValue([]);
    vi.mocked(paginaMensagens).mockRejectedValueOnce(new ErroDeApi(erro, null, "sem acesso"));
    const tela = montar([mensagem("inicial")], "conectado");
    tela.reconectar();
    act(() => tela.aviso(mensagem("não autorizada", MAIS_NOVA)));
    await passar(3_000);
    expect(tela.acessoPerdido).toHaveBeenCalledExactlyOnceWith("chat-a", erro);
    act(() => tela.chegar(mensagem("tardia", MAIS_NOVA)));
    expect(tela.cliente.getQueryData(tela.chave)).toBeUndefined();
  });
  it("refaz GET transitório na mesma conexão a partir da lacuna original e funde eventos mais novos", async () => {
    vi.useFakeTimers();
    const empate = mensagem("empate-da-ancora");
    const recuperada = mensagem("perdida", "2026-11-19T20:00:01Z");
    const nova = mensagem("em-tempo-real", MAIS_NOVA);
    vi.mocked(mensagensDesde)
      .mockRejectedValueOnce(new ErroDeApi(503, null, "indisponível"))
      .mockResolvedValueOnce([empate, recuperada, nova]);
    const tela = montar([mensagem("primeira"), mensagem("temp-otimista", "2026-11-19T20:04:00Z")]);

    tela.reconectar();
    await passar(0);
    expect(mensagensDesde).toHaveBeenCalledTimes(1);
    act(() => tela.chegar(nova));
    await passar(49);
    expect(mensagensDesde).toHaveBeenCalledTimes(1);
    await passar(2);

    expect(vi.mocked(mensagensDesde).mock.calls.map(([, cursor]) => cursor))
      .toEqual([ANTES_DA_PRIMEIRA, ANTES_DA_PRIMEIRA]);
    expect(tela.result.current.data.map(({ id }) => id)).toEqual([
      "primeira", "empate-da-ancora", "perdida", "em-tempo-real", "temp-otimista",
    ]);
    expect(tela.result.current.isErrorRecuperacao).toBe(false);
  });

  it("encerra o backoff depois de três falhas; retry manual ainda cobre a mesma lacuna", async () => {
    vi.useFakeTimers();
    vi.mocked(mensagensDesde).mockRejectedValue(new ErroDeApi(504, null, "timeout"));
    const tela = montar([mensagem("primeira")]);
    tela.reconectar();

    await passar(500);
    expect(mensagensDesde).toHaveBeenCalledTimes(3);
    expect(tela.result.current.isErrorRecuperacao).toBe(true);
    act(() => tela.chegar(mensagem("em-tempo-real", MAIS_NOVA)));
    vi.mocked(mensagensDesde).mockResolvedValueOnce([mensagem("perdida", "2026-11-19T20:00:01Z")]);
    act(() => tela.result.current.retentarRecuperacao());
    await passar(2);

    expect(mensagensDesde).toHaveBeenCalledTimes(4);
    expect(mensagensDesde).toHaveBeenLastCalledWith("chat-a", ANTES_DA_PRIMEIRA, expect.any(AbortSignal));
    expect(tela.result.current.data.map(({ id }) => id)).toEqual(["primeira", "perdida", "em-tempo-real"]);
    expect(tela.result.current.isErrorRecuperacao).toBe(false);
  });

  it("aborta o ciclo anterior e não aplica sua resposta tardia ou a de outro atendimento", async () => {
    const anterior = adiar<MensagemResposta[]>();
    const atual = adiar<MensagemResposta[]>();
    vi.mocked(mensagensDesde).mockReturnValueOnce(anterior.promessa).mockReturnValueOnce(atual.promessa);
    vi.mocked(paginaMensagens).mockResolvedValue({ mensagens: [mensagem("de-b", PRIMEIRA, "chat-b")], proximoCursor: null });
    const tela = montar([mensagem("primeira")]);
    tela.reconectar();
    tela.reconectar(2);

    expect(vi.mocked(mensagensDesde).mock.calls[0][2]?.aborted).toBe(true);
    expect(vi.mocked(mensagensDesde).mock.calls[1][1]).toBe(ANTES_DA_PRIMEIRA);
    await act(async () => anterior.resolver([mensagem("resposta-antiga", MAIS_NOVA)]));
    expect(tela.result.current.data.map(({ id }) => id)).toEqual(["primeira"]);

    tela.rerender({ ...tela.props, atendimento: "chat-b", estado: "conectado", ciclo: 2, liberado: false });
    expect(vi.mocked(mensagensDesde).mock.calls[1][2]?.aborted).toBe(true);
    await act(async () => atual.resolver([mensagem("resposta-de-a", MAIS_NOVA)]));
    await waitFor(() => expect(tela.result.current.data.map(({ id }) => id)).toEqual(["de-b"]));
    expect(tela.cliente.getQueryData<DadosDoHistorico>(tela.chave)?.pages[0].mensagens).toHaveLength(1);
  });

  it("não repovoa chave revogada mesmo se o transporte resolver depois do abort", async () => {
    const pendente = adiar<PaginaMensagens>();
    vi.mocked(paginaMensagens).mockReturnValueOnce(pendente.promessa);
    const tela = montar([]);
    tela.reconectar();

    act(() => tela.cliente.removeQueries({ queryKey: tela.chave, exact: true }));
    expect(vi.mocked(paginaMensagens).mock.calls[0][2]?.aborted).toBe(true);
    await act(async () => pendente.resolver({ mensagens: [mensagem("restrita")], proximoCursor: null }));
    expect(tela.cliente.getQueryData(tela.chave)).toBeUndefined();
    expect(mensagensDesde).not.toHaveBeenCalled();
  });

  it.each([403, 404])("descarta histórico e não repete uma recusa HTTP %s", async (status) => {
    vi.mocked(mensagensDesde).mockRejectedValue(new ErroDeApi(status, null, "sem acesso"));
    const tela = montar([mensagem("privada")]);
    tela.reconectar();

    await waitFor(() => expect(tela.acessoPerdido).toHaveBeenCalledWith("chat-a", status));
    act(() => tela.chegar(mensagem("restrita", MAIS_NOVA)));
    expect(tela.cliente.getQueryData(tela.chave)).toBeUndefined();
    expect(mensagensDesde).toHaveBeenCalledTimes(1);
    expect(tela.result.current.isErrorRecuperacao).toBe(false);
  });

  it.each([true, false])("aproveita a carga inicial com o socket conectado (terminou primeiro: %s)", async (terminouPrimeiro) => {
    const pendente = adiar<PaginaMensagens>();
    vi.mocked(paginaMensagens).mockReturnValueOnce(pendente.promessa);
    const tela = montar(undefined, "conectado");

    if (!terminouPrimeiro) tela.reconectar();
    await act(async () => pendente.resolver({ mensagens: [mensagem("inicial")], proximoCursor: "anterior" }));
    await waitFor(() => expect(tela.result.current.data.map(({ id }) => id)).toEqual(["inicial"]));
    if (terminouPrimeiro) tela.reconectar();
    expect(paginaMensagens).toHaveBeenCalledTimes(1);
    expect(mensagensDesde).not.toHaveBeenCalled();
  });

  it("reaproveita a âncora da carga inicial se um frame foi descartado aguardando o snapshot", async () => {
    const pendente = adiar<PaginaMensagens>();
    const perdida = mensagem("perdida", MAIS_NOVA);
    vi.mocked(paginaMensagens).mockReturnValueOnce(pendente.promessa);
    vi.mocked(mensagensDesde).mockResolvedValueOnce([perdida]);
    const tela = montar(undefined, "conectado");

    act(() => tela.chegar(perdida));
    await act(async () => pendente.resolver({ mensagens: [mensagem("inicial")], proximoCursor: "anterior" }));
    tela.reconectar();

    await waitFor(() => expect(tela.result.current.data.map(({ id }) => id)).toEqual(["inicial", "perdida"]));
    expect(mensagensDesde).toHaveBeenCalledExactlyOnceWith("chat-a", ANTES_DA_PRIMEIRA, expect.any(AbortSignal));
    expect(paginaMensagens).toHaveBeenCalledTimes(1);
  });
});
