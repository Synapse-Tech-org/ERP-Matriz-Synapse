import { InfiniteQueryObserver, QueryClient, isCancelledError } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { DadosDoHistorico } from "./cache-mensagens";
import { criarLeituraConcorrenteDoHistorico } from "./historico-leitura-concorrente";
import type { MensagemResposta, PaginaMensagens } from "./types";

const CHAVE = ["mensagens", "chat-a"] as const;

function mensagem(id: string, statusEntrega: MensagemResposta["statusEntrega"] = "PENDENTE") {
  return {
    id, atendimentoId: "chat-a", remetenteTipo: "ATENDENTE",
    remetenteId: null, remetenteNome: null, tipo: "TEXTO", conteudo: id,
    midiaUrl: null, midiaMetadados: null, opcoes: null, statusEntrega, erroEntrega: null,
    enviadoEm: "2026-11-23T11:00:00Z",
  } satisfies MensagemResposta;
}

/** A garantia é exercitada no cache do TanStack, inclusive a gravação ao concluir o fetch. */
function montar(pagina: PaginaMensagens) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const leitura = criarLeituraConcorrenteDoHistorico();
  function gravar(mensagens: MensagemResposta[]) {
    return client.setQueryData<DadosDoHistorico>(CHAVE, {
      pages: [{ ...pagina, mensagens }], pageParams: [null],
    });
  }
  gravar(pagina.mensagens);

  let resolver!: (valor: PaginaMensagens) => void;
  const rede = new Promise<PaginaMensagens>((resolve) => { resolver = resolve; });
  const opcoes = {
    queryKey: CHAVE,
    queryFn: async () => {
      const base = client.getQueryData<DadosDoHistorico>(CHAVE);
      return leitura.marcarPagina(await rede, base);
    },
    structuralSharing: leitura.compartilhar,
    initialPageParam: null as string | null,
    getNextPageParam: (ultima: PaginaMensagens) => ultima.proximoCursor ?? undefined,
    staleTime: 0,
  };
  function ler() { return client.getQueryData<DadosDoHistorico>(CHAVE); }
  return { client, opcoes, resolver, gravar, ler };
}

describe("leitura concorrente do histórico", () => {
  it("mantém a prévia do álbum durante uma releitura e deduplica o aceite pelo mesmo clique", async () => {
    const local = {
      ...mensagem("temp-foto"), tipo: "IMAGEM" as const,
      ordemLocalDoLoteEm: "2026-11-23T11:00:00.001Z", idempotencyKey: "foto",
      midiaUrl: "blob:foto", midiaMetadados: '{"loteFotosId":"lote"}',
    };
    const outra = { ...local, id: "temp-outra", idempotencyKey: "outra" };
    const tela = montar({ mensagens: [local, outra], proximoCursor: null });
    const leitura = tela.client.fetchInfiniteQuery(tela.opcoes);
    tela.resolver({ mensagens: [{
      ...mensagem("real"), tipo: "IMAGEM", idempotencyKey: "foto",
      midiaUrl: "https://storage.test/foto.png", midiaMetadados: local.midiaMetadados,
    }], proximoCursor: null });
    await leitura;
    expect(tela.ler()?.pages[0].mensagens).toEqual([
      expect.objectContaining({ id: "real", ordemLocalDoLoteEm: local.ordemLocalDoLoteEm }),
      outra,
    ]);
  });

  it("um GET antigo não apaga nova mensagem nem regride STATUS aplicado com o socket conectado", async () => {
    const antes = mensagem("envio");
    const tela = montar({ mensagens: [antes, mensagem("ja-nao-visivel")], proximoCursor: null });
    const leitura = tela.client.fetchInfiniteQuery(tela.opcoes);

    const nova = mensagem("chegou-no-socket", "ENVIADO");
    tela.gravar([{ ...antes, statusEntrega: "ENTREGUE" }, mensagem("ja-nao-visivel"), nova]);
    tela.resolver({ mensagens: [{ ...antes, conteudo: null }], proximoCursor: null });

    await leitura;
    expect(tela.ler()?.pages[0].mensagens).toEqual([
      expect.objectContaining({ id: "envio", statusEntrega: "ENTREGUE", conteudo: null }),
      expect.objectContaining({ id: "chegou-no-socket", statusEntrega: "ENVIADO" }),
    ]);
  });

  it("paginar preserva o prefixo atual e não duplica a mesma mensagem entre páginas", async () => {
    const anterior = mensagem("envio");
    const tela = montar({ mensagens: [anterior], proximoCursor: "cursor" });
    const observador = new InfiniteQueryObserver(tela.client, { ...tela.opcoes, enabled: false });
    const paginaAnterior = observador.fetchNextPage();

    tela.gravar([{ ...anterior, statusEntrega: "LIDO" }, mensagem("nova", "ENVIADO")]);
    tela.resolver({ mensagens: [mensagem("mais-antiga"), anterior], proximoCursor: null });

    await paginaAnterior;
    expect(tela.ler()?.pages.map((pagina) => pagina.mensagens.map(({ id, statusEntrega }) => [id, statusEntrega])))
      .toEqual([[["envio", "LIDO"], ["nova", "ENVIADO"]], [["mais-antiga", "PENDENTE"]]]);
    expect(tela.ler()?.pageParams).toEqual([null, "cursor"]);
    observador.destroy();
  });

  it("funde otimista por chave e não preserva placeholders anteriores ao GET", async () => {
    const temporaria = { ...mensagem("temp-confirmar"), idempotencyKey: "um" };
    const removida = { ...mensagem("temp-removida"), idempotencyKey: "dois" };
    const preexistente = mensagem("temp-preexistente");
    const tela = montar({ mensagens: [temporaria, removida, preexistente], proximoCursor: null });
    const leitura = tela.client.fetchInfiniteQuery(tela.opcoes);

    tela.gravar([temporaria, preexistente, mensagem("temp-aguardando")]);
    tela.resolver({
      mensagens: [{ ...mensagem("confirmada", "ENVIADO"), idempotencyKey: "um" }],
      proximoCursor: null,
    });

    await leitura;
    expect(tela.ler()?.pages[0].mensagens.map((item) => item.id)).toEqual(["confirmada", "temp-aguardando"]);
    tela.gravar([]);
    expect(tela.ler()?.pages[0].mensagens).toEqual([]);
  });

  it("preserva confirmação persistida durante a carga sem cache e não restaura o otimista substituído", async () => {
    const tela = montar({ mensagens: [], proximoCursor: null });
    tela.client.removeQueries({ queryKey: CHAVE, exact: true });
    const leitura = tela.client.fetchInfiniteQuery(tela.opcoes);

    tela.gravar([{ ...mensagem("temp-envio"), idempotencyKey: "envio" }]);
    tela.gravar([{ ...mensagem("confirmada", "ENVIADO"), idempotencyKey: "envio" }]);
    tela.resolver({ mensagens: [], proximoCursor: null });

    await leitura;
    expect(tela.ler()?.pages[0].mensagens).toEqual([
      expect.objectContaining({ id: "confirmada", statusEntrega: "ENVIADO", idempotencyKey: "envio" }),
    ]);
  });

  it("mantém a remoção do histórico revogado mesmo se o transporte entregar o GET atrasado", async () => {
    const tela = montar({ mensagens: [mensagem("privada")], proximoCursor: null });
    const resultado = tela.client.fetchInfiniteQuery(tela.opcoes).catch((erro: unknown) => erro);
    tela.client.removeQueries({ queryKey: CHAVE, exact: true });
    tela.resolver({ mensagens: [mensagem("privada")], proximoCursor: null });
    expect(isCancelledError(await resultado)).toBe(true);
    expect(tela.ler()).toBeUndefined();
  });
});
