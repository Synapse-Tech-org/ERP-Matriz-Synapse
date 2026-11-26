import { replaceEqualDeep } from "@tanstack/react-query";

import type { DadosDoHistorico } from "./cache-mensagens";
import { mesclarMensagens } from "./tempo-real";
import type { MensagemResposta, PaginaMensagens } from "./types";

function ehHistorico(dados: unknown): dados is DadosDoHistorico {
  return dados != null && typeof dados === "object"
    && "pages" in dados && Array.isArray(dados.pages)
    && "pageParams" in dados && Array.isArray(dados.pageParams);
}

function temporaria(mensagem: MensagemResposta): boolean {
  return mensagem.id.startsWith("temp-");
}

function indexarMensagens(mensagens: MensagemResposta[]) {
  const porId = new Map<string, MensagemResposta>();
  const porChave = new Map<string, MensagemResposta>();
  for (const mensagem of mensagens) {
    porId.set(mensagem.id, mensagem);
    const chave = mensagem.idempotencyKey;
    if (chave && (!porChave.has(chave) || !temporaria(mensagem))) porChave.set(chave, mensagem);
  }
  return (mensagem: MensagemResposta) =>
    porId.get(mensagem.id) ?? (mensagem.idempotencyKey ? porChave.get(mensagem.idempotencyKey) : undefined);
}

function conciliarSnapshot(
  resposta: MensagemResposta,
  atual: MensagemResposta | undefined,
  anterior: MensagemResposta | undefined,
): MensagemResposta {
  if (!atual) return resposta;
  const { statusEntrega, erroEntrega } = mesclarMensagens([atual], [resposta])[0];
  return {
    // A REST é autoridade para conteúdo e metadados, inclusive quando omite ou limpa algo.
    ...resposta,
    statusEntrega,
    erroEntrega,
    idempotencyKey: resposta.idempotencyKey ?? atual.idempotencyKey,
    ...(atual.ordemLocalDoLoteEm ? { ordemLocalDoLoteEm: atual.ordemLocalDoLoteEm } : {}),
    ...(anterior && replaceEqualDeep(anterior.reacoes, atual.reacoes) !== anterior.reacoes
      ? { reacoes: atual.reacoes } : {}),
    ...(anterior && anterior.reacaoDoCliente !== atual.reacaoDoCliente
      ? { reacaoDoCliente: atual.reacaoDoCliente } : {}),
  };
}

function consolidarPaginas(
  atual: DadosDoHistorico,
  resposta: DadosDoHistorico,
  base: DadosDoHistorico | undefined,
  primeiraPaginaRest: number,
): DadosDoHistorico {
  const atuais = atual.pages.flatMap((pagina) => pagina.mensagens);
  const encontrarAtual = indexarMensagens(atuais);
  const encontrarAnterior = indexarMensagens(base?.pages.flatMap((pagina) => pagina.mensagens) ?? []);

  const pages = resposta.pages.map((pagina, indice) => {
    if (indice < primeiraPaginaRest && atual.pages[indice]
      && atual.pageParams[indice] === resposta.pageParams[indice]) {
      // fetchNextPage carregou só a próxima página; o prefixo que o TanStack reapresenta
      // é o cache capturado no início, não a versão já atualizada pelo WebSocket/envio.
      return atual.pages[indice];
    }
    return {
      ...pagina,
      mensagens: pagina.mensagens.map((mensagem) =>
        conciliarSnapshot(mensagem, encontrarAtual(mensagem), encontrarAnterior(mensagem))),
    };
  });
  const retornadas = pages.flatMap((pagina) => pagina.mensagens);
  const encontrarPersistida = indexarMensagens(retornadas.filter((mensagem) => !temporaria(mensagem)));
  const ids = new Set<string>();
  const chaves = new Set<string>();
  function manter(mensagem: MensagemResposta) {
    if (temporaria(mensagem) && encontrarPersistida(mensagem)) return false;
    const chave = mensagem.idempotencyKey;
    if (ids.has(mensagem.id) || (chave && chaves.has(chave))) return false;
    ids.add(mensagem.id);
    if (chave) chaves.add(chave);
    return true;
  }

  const unicas = pages.map((pagina) => ({ ...pagina, mensagens: pagina.mensagens.filter(manter) }));
  // Não recoloca linhas antigas ausentes no snapshot, inclusive otimistas anteriores.
  // Só mantém novas identidades surgidas durante o pedido, mais posições do lote ainda locais:
  // algumas prévias aguardam sua vez na fila de upload e naturalmente não existem na REST.
  const concorrentes = atuais.filter((mensagem) => {
    const anterior = encontrarAnterior(mensagem);
    return (!anterior || (temporaria(anterior) && !temporaria(mensagem))
      || (temporaria(mensagem) && mensagem.ordemLocalDoLoteEm != null)) && manter(mensagem);
  });
  if (concorrentes.length && unicas[0]) {
    const recente = unicas[0];
    const mensagens = [...recente.mensagens, ...concorrentes]
      .sort((a, b) => Date.parse(a.enviadoEm) - Date.parse(b.enviadoEm));
    unicas[0] = { ...recente, mensagens };
  }
  return { ...resposta, pages: unicas };
}

/**
 * Distingue a troca de cache causada pelo fetch do histórico das escritas locais. A marca não
 * é serializada nem sobrevive ao commit. Não se inicia uma segunda leitura para reconciliar.
 */
export function criarLeituraConcorrenteDoHistorico() {
  const basesPorPagina = new WeakMap<PaginaMensagens, DadosDoHistorico | undefined>();
  return {
    marcarPagina(pagina: PaginaMensagens, base: DadosDoHistorico | undefined): PaginaMensagens {
      const marcada = { ...pagina };
      basesPorPagina.set(marcada, base);
      return marcada;
    },
    compartilhar(antigo: unknown, novo: unknown): unknown {
      if (!ehHistorico(novo)) return replaceEqualDeep(antigo, novo);
      const indice = novo.pages.findIndex((pagina) => basesPorPagina.has(pagina));
      if (indice < 0) return replaceEqualDeep(antigo, novo);

      const base = basesPorPagina.get(novo.pages[indice]);
      for (const pagina of novo.pages) basesPorPagina.delete(pagina);
      return replaceEqualDeep(antigo, ehHistorico(antigo) ? consolidarPaginas(antigo, novo, base, indice) : novo);
    },
  };
}
