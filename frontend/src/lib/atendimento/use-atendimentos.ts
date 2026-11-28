"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { ErroDeApi } from "@/lib/api/errors";
import { useCapacidades } from "@/lib/gestao/use-capacidades";

import { contarAtendimentosPorVisao, listarAtendimentos, listarInboxUnificada } from "./api";
import type { PaginaInbox } from "./api";
import type { ItemInbox, VisaoAtendimento } from "./types";

export function useAtendimentos(visao: VisaoAtendimento, atendenteId?: string | null, habilitado = true) {
  const capacidades = useCapacidades();
  const acessoClientes = capacidades.pode("clientes.acessar");
  const acessoChatInterno = capacidades.pode("chat_interno.usar");
  const queryClient = useQueryClient();
  const inboxSemFiltro = queryClient.getQueryData<InfiniteData<PaginaInbox>>([
    "atendimentos",
    "inbox",
    visao,
  ]);
  const atendentesConhecidos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const pagina of acessoClientes ? inboxSemFiltro?.pages ?? [] : []) {
      for (const item of pagina.itens) {
        if (item && item.tipo !== "EQUIPE_INTERNA" && item.atendenteId && item.atendenteNome) {
          mapa.set(item.atendenteId, item.atendenteNome);
        }
      }
    }
    return Array.from(mapa.entries());
  }, [inboxSemFiltro, acessoClientes]);

  const inbox = useInfiniteQuery({
    // Query infinita e query comum não podem compartilhar a mesma chave: os formatos de cache
    // (`pages/pageParams` e array) são incompatíveis e se corrompem no refetch por WebSocket.
    queryKey: atendenteId
      ? ["atendimentos", "inbox", visao, atendenteId]
      : ["atendimentos", "inbox", visao],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listarInboxUnificada(visao, pageParam, 50, atendenteId ?? null, signal),
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
    enabled: habilitado && (acessoClientes || acessoChatInterno),
    // A indisponibilidade explícita já é um sinal de saturação/timeout. Não repita o
    // lote na hora; foco, reconexão e tentativa explícita continuam revalidando a lista.
    retry: (tentativas, erro) => tentativas < 1
      && !(erro instanceof ErroDeApi && [401, 403, 503].includes(erro.status)),
  });
  const negado = inbox.error instanceof ErroDeApi && [401, 403].includes(inbox.error.status);
  const paginas = negado ? undefined : inbox.data?.pages;
  const buscarProxima = inbox.fetchNextPage;
  const fetchNextPage = useCallback(() => buscarProxima({ cancelRefetch: false }), [buscarProxima]);
  const itensInbox = useMemo(
    () => paginas?.flatMap((pagina) => pagina?.itens ?? []).filter(itemPresente)
      .filter(item => item.tipo === "EQUIPE_INTERNA" ? acessoChatInterno : acessoClientes),
    [paginas, acessoClientes, acessoChatInterno],
  );
  return {
    ...inbox,
    data: itensInbox,
    hasNextPage: !negado && inbox.hasNextPage,
    isFetchingNextPage: inbox.isFetchingNextPage,
    fetchNextPage,
    atendentesConhecidos: negado ? [] : atendentesConhecidos,
  };
}

function itemPresente(item: ItemInbox | null | undefined): item is ItemInbox {
  return item != null;
}

/** Os badges das abas (E17b §Bloco 6) — uma contagem por visão, independente de qual aba está ativa. */
export function useContagemDeAtendimentos(habilitado = true) {
  const acessoClientes = useCapacidades().pode("clientes.acessar");
  const consulta = useQuery({
    queryKey: ["atendimentos", "contagem"],
    queryFn: () => contarAtendimentosPorVisao(),
    enabled: habilitado && acessoClientes,
  });
  return { ...consulta, data: acessoClientes ? consulta.data : undefined };
}

/**
 * Chave FORA do prefixo `["atendimentos"]` de propósito (E225, B4): os diálogos que listam atendimentos para o usuário
 * escolher (encaminhar, lembrete, mensagem programada) não devem ser relidos a cada evento de tempo real — o prefixo
 * `["atendimentos"]` é invalidado por toda rajada, e esta lista é a de TODOS inteira, sem paginação.
 */
export const CHAVE_ATENDIMENTOS_PARA_ESCOLHA = ["dialogos", "atendimentos", "TODOS"] as const;

/** Mesma validade que o app já usa para dados que mudam pouco (capacidade do canal): 5 minutos. */
export const STALE_TIME_DOS_DIALOGOS_MS = 5 * 60 * 1000;

/** A lista de atendimentos que um diálogo oferece para escolha; só busca quando o diálogo está aberto. */
export function useAtendimentosParaEscolha(habilitado: boolean) {
  const acessoClientes = useCapacidades().pode("clientes.acessar");
  const consulta = useQuery({
    queryKey: CHAVE_ATENDIMENTOS_PARA_ESCOLHA,
    queryFn: () => listarAtendimentos("TODOS"),
    enabled: habilitado && acessoClientes,
    staleTime: STALE_TIME_DOS_DIALOGOS_MS,
  });
  return { ...consulta, data: acessoClientes ? consulta.data : undefined };
}
