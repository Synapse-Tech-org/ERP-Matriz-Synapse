import { apiFetch, apiFetchArquivo } from "@/lib/api/http-client";
import { baixarBlobComoArquivo } from "@/lib/midia/baixar-arquivo";

import type {
  AreaFeedback,
  CursorDeFeedbacks,
  FeedbackAcompanhado,
  FeedbackCriado,
  PaginaDeFeedbacks,
  TipoFeedback,
} from "./types";

export function enviarFeedback(dados: {
  tipo: TipoFeedback;
  areaChave: AreaFeedback;
  descricao: string;
  arquivo?: File;
}) {
  const { arquivo, ...feedback } = dados;
  if (arquivo) {
    const formulario = new FormData();
    formulario.append("feedback", new Blob([JSON.stringify(feedback)], { type: "application/json" }));
    formulario.append("arquivo", arquivo);
    return apiFetch<FeedbackCriado>("/api/v1/feedbacks", { method: "POST", body: formulario });
  }
  return apiFetch<FeedbackCriado>("/api/v1/feedbacks", {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

export async function baixarAnexoFeedback(id: string, nomeOriginal: string) {
  const { blob, nome } = await apiFetchArquivo("/api/v1/feedbacks/" + encodeURIComponent(id) + "/anexo");
  baixarBlobComoArquivo(blob, nome ?? nomeOriginal);
}

export function listarFeedbacks({
  tipo,
  cursor,
  limite = 20,
}: {
  tipo: TipoFeedback | null;
  cursor: CursorDeFeedbacks | null;
  limite?: number;
}) {
  const busca = new URLSearchParams({ limite: String(limite) });
  if (tipo) busca.set("tipo", tipo);
  if (cursor) {
    busca.set("antesDe", cursor.antesDe);
    busca.set("antesDoId", cursor.antesDoId);
  }
  return apiFetch<PaginaDeFeedbacks>(`/api/v1/feedbacks?${busca.toString()}`);
}

export function listarMeusFeedbacks(cursor: CursorDeFeedbacks | null, signal?: AbortSignal) {
  const busca = new URLSearchParams();
  if (cursor) {
    busca.set("antesDe", cursor.antesDe);
    busca.set("antesDoId", cursor.antesDoId);
  }
  return apiFetch<PaginaDeFeedbacks<FeedbackAcompanhado>>("/api/v1/feedbacks/meus?" + busca.toString(), { signal });
}

export function responderFeedback({ id, resposta }: { id: string; resposta: string }) {
  return apiFetch<void>("/api/v1/feedbacks/" + encodeURIComponent(id) + "/resposta", {
    method: "PUT",
    body: JSON.stringify({ resposta }),
  });
}
