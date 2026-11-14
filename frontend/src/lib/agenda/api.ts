import { apiFetch, apiFetchBlob } from "@/lib/api/http-client";

import type { CatalogosDeFiltro, CampoFiltravel, CriterioRequisicao, LeadParaEntrada, PaginaDeLeads } from "./types";

/** Único critério sempre-verdadeiro: `criadoEm` nunca é nulo, então "sem filtro" vira isto. */
export const CRITERIO_SEM_FILTRO: CriterioRequisicao = {
  tipo: "SIMPLES",
  campo: "criadoEm",
  operador: "PREENCHIDO",
};

export function listarCamposFiltraveis(): Promise<CampoFiltravel[]> {
  return apiFetch<CampoFiltravel[]>("/api/v1/leads/filtrar/campos");
}

export function listarCatalogosDeFiltro(): Promise<CatalogosDeFiltro> {
  return apiFetch<CatalogosDeFiltro>("/api/v1/leads/filtrar/catalogos");
}

export function filtrarLeads(
  criterio: CriterioRequisicao,
  pagina: number,
  tamanho: number,
  signal?: AbortSignal,
): Promise<PaginaDeLeads> {
  return apiFetch<PaginaDeLeads>("/api/v1/leads/filtrar", {
    method: "POST",
    body: JSON.stringify({ criterio, pagina, tamanho }),
    signal,
  });
}

export async function contarLeads(criterio: CriterioRequisicao): Promise<number> {
  const resposta = await apiFetch<{ total: number }>("/api/v1/leads/filtrar/contagem", {
    method: "POST",
    body: JSON.stringify({ criterio }),
  });
  return resposta.total;
}

export function contarLeadsPorEtapa(criterio: CriterioRequisicao) {
  return apiFetch<{ total: number; etapas: { etapaId: string | null; total: number }[] }>(
    "/api/v1/leads/filtrar/contagem?porEtapa=true",
    { method: "POST", body: JSON.stringify({ criterio }) },
  );
}

export function buscarLeadsParaEntrada(termo: string): Promise<LeadParaEntrada[]> {
  return apiFetch<LeadParaEntrada[]>(`/api/v1/leads/busca-entrada?termo=${encodeURIComponent(termo)}`);
}

export interface ResultadoImportacaoLeads {
  totalDeLinhas: number;
  validas: number;
  jaExistiam: number;
  recusadas: Array<{ linha: number; motivo: string }>;
}

function arquivoDaImportacao(arquivo: File): FormData {
  const formulario = new FormData();
  formulario.append("arquivo", arquivo);
  return formulario;
}

export function visualizarImportacaoLeads(arquivo: File): Promise<ResultadoImportacaoLeads> {
  return apiFetch<ResultadoImportacaoLeads>("/api/v1/leads/importacao/preview", {
    method: "POST",
    body: arquivoDaImportacao(arquivo),
  });
}

export function confirmarImportacaoLeads(arquivo: File): Promise<ResultadoImportacaoLeads> {
  return apiFetch<ResultadoImportacaoLeads>("/api/v1/leads/importacao/confirmar", {
    method: "POST",
    body: arquivoDaImportacao(arquivo),
  });
}

export function exportarLeadsCsv(criterio: CriterioRequisicao): Promise<Blob> {
  return apiFetchBlob(`/api/v1/leads/exportar?criterio=${encodeURIComponent(JSON.stringify(criterio))}`);
}
