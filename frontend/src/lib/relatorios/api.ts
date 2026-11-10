import { apiFetch, apiFetchArquivo } from "@/lib/api/http-client";
import type { TEXTOS_RELATORIOS } from "@/lib/config/schema-relatorios";

export type PeriodoRelatorio = keyof typeof TEXTOS_RELATORIOS.periodos;
export type StatusRelatorio = keyof typeof TEXTOS_RELATORIOS.statusRotulos;

export interface FiltrosRelatorio {
  periodo: PeriodoRelatorio;
  inicio: string;
  fim: string;
  busca: string;
  status: StatusRelatorio | "";
  etapa: string;
  atendente: string;
}

export interface LinhaRelatorio {
  id: string;
  leadId: string;
  cliente: string;
  empresa: string | null;
  atendente: string | null;
  etapa: string | null;
  status: StatusRelatorio;
  iniciadoEm: string;
  finalizadoEm: string | null;
  duracaoSegundos: number | null;
  csat: number | null;
}

export interface GrupoRelatorio {
  id: string | null;
  nome: string | null;
  total: number;
  csatMedio: number | null;
}

export interface RelatorioAtendimentos {
  linhas: LinhaRelatorio[];
  resumo: { total: number; finalizados: number; duracaoMediaSegundos: number | null; csatMedio: number | null; avaliacoes: number };
  porStatus: GrupoRelatorio[];
  porEtapa: GrupoRelatorio[];
  porAtendente: GrupoRelatorio[];
  fusoHorario: string;
}

const ROTA = "/api/v1/relatorios/atendimentos";
export const TAMANHO_PAGINA_RELATORIO = 20;

function parametros(filtros: FiltrosRelatorio) {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (!valor) continue;
    if ((chave === "inicio" || chave === "fim") && filtros.periodo !== "PERSONALIZADO") continue;
    busca.set(chave, valor);
  }
  return busca;
}

export function consultarRelatorio(filtros: FiltrosRelatorio, pagina: number, signal?: AbortSignal) {
  const query = parametros(filtros);
  query.set("pagina", String(pagina));
  query.set("tamanho", String(TAMANHO_PAGINA_RELATORIO));
  return apiFetch<RelatorioAtendimentos>(ROTA + "?" + query.toString(), { signal });
}

export function exportarRelatorio(filtros: FiltrosRelatorio) {
  return apiFetchArquivo(ROTA + "/exportacao?" + parametros(filtros).toString());
}
