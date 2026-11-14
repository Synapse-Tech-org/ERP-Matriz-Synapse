"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { enviarFeedback, listarFeedbacks, listarMeusFeedbacks, responderFeedback } from "./api";
import type { CursorDeFeedbacks, TipoFeedback } from "./types";

export function useEnviarFeedback() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: enviarFeedback,
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["feedbacks", "administracao"] });
      void cache.invalidateQueries({ queryKey: ["feedbacks", "meus"] });
    },
  });
}

export function useResponderFeedback() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: responderFeedback,
    onSuccess: () => cache.invalidateQueries({ queryKey: ["feedbacks"] }),
  });
}

export function useMeusFeedbacks(usuarioId: string | null) {
  return useInfiniteQuery({
    queryKey: ["feedbacks", "meus", usuarioId],
    enabled: Boolean(usuarioId),
    initialPageParam: null as CursorDeFeedbacks | null,
    queryFn: ({ pageParam, signal }) => listarMeusFeedbacks(pageParam, signal),
    getNextPageParam: proximoCursor,
  });
}

function proximoCursor(pagina: { proximoCriadoEm: string | null; proximoId: string | null }) {
  return pagina.proximoCriadoEm && pagina.proximoId
    ? { antesDe: pagina.proximoCriadoEm, antesDoId: pagina.proximoId }
    : undefined;
}

export function useFeedbacksAdministrativos(tipo: TipoFeedback | null) {
  return useInfiniteQuery({
    queryKey: ["feedbacks", "administracao", tipo],
    initialPageParam: null as CursorDeFeedbacks | null,
    queryFn: ({ pageParam }) => listarFeedbacks({ tipo, cursor: pageParam }),
    getNextPageParam: proximoCursor,
  });
}
