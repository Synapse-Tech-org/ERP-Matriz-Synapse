import { apiFetch, apiFetchArquivo, apiFetchBlob } from "@/lib/api/http-client";

const ROTA = "/api/v1/banco-arquivos";

export const PASTAS_DO_BANCO = ["catalogos", "tabelas", "contratos", "projetos", "orcamentos", "fotos"] as const;
export const TIPOS_DO_BANCO = ["PDF", "XLSX", "DOCX", "IMAGEM", "DWG"] as const;
export const ORDENS_DO_BANCO = ["recentes", "nome", "tamanho"] as const;
export const CHAVE_DO_BANCO = ["banco-arquivos"] as const;

export type PastaDoBanco = (typeof PASTAS_DO_BANCO)[number];
export type TipoDoBanco = (typeof TIPOS_DO_BANCO)[number];
export type OrdemDoBanco = (typeof ORDENS_DO_BANCO)[number];

export interface ArquivoDoBanco {
  id: string;
  nome: string;
  pasta: PastaDoBanco;
  tipo: TipoDoBanco;
  mimeType: string;
  tamanhoBytes: number;
  descricao: string | null;
  criadoEm: string;
}

export interface FiltrosDoBanco {
  pasta: PastaDoBanco | null;
  tipo: TipoDoBanco | null;
  busca: string;
  ordem: OrdemDoBanco;
  pagina: number;
  tamanho: number;
}

export interface ResultadoDoBanco {
  itens: ArquivoDoBanco[];
  total: number;
  contagemPorPasta: Partial<Record<PastaDoBanco, number>>;
  usadoBytes: number;
  limiteBytes: number;
  limiteArquivoBytes: number;
  limiteDescricao: number;
}

export interface EdicaoDoBanco {
  nome: string;
  pasta: PastaDoBanco;
  descricao: string;
}

function rotaDoArquivo(id: string) {
  return `${ROTA}/${encodeURIComponent(id)}`;
}

export function listarArquivosDoBanco(filtros: FiltrosDoBanco, signal?: AbortSignal) {
  const busca = new URLSearchParams({
    ordem: filtros.ordem,
    pagina: String(filtros.pagina),
    tamanho: String(filtros.tamanho),
  });
  if (filtros.busca) busca.set("busca", filtros.busca);
  if (filtros.pasta) busca.set("pasta", filtros.pasta);
  if (filtros.tipo) busca.set("tipo", filtros.tipo);
  return apiFetch<ResultadoDoBanco>(`${ROTA}?${busca}`, { signal });
}

export function obterArquivoDoBanco(id: string, signal?: AbortSignal) {
  return apiFetch<ArquivoDoBanco>(rotaDoArquivo(id), { signal });
}

export function adicionarArquivoAoBanco(arquivo: File, pasta: PastaDoBanco, descricao: string) {
  const dados = new FormData();
  dados.set("arquivo", arquivo);
  dados.set("pasta", pasta);
  dados.set("descricao", descricao);
  return apiFetch<ArquivoDoBanco>(ROTA, { method: "POST", body: dados });
}

export function editarArquivoDoBanco(id: string, dados: EdicaoDoBanco) {
  return apiFetch<ArquivoDoBanco>(rotaDoArquivo(id), { method: "PATCH", body: JSON.stringify(dados) });
}

export function removerArquivoDoBanco(id: string) {
  return apiFetch<void>(rotaDoArquivo(id), { method: "DELETE" });
}

export function restaurarArquivoDoBanco(id: string) {
  return apiFetch<ArquivoDoBanco>(`${rotaDoArquivo(id)}/restaurar`, { method: "POST" });
}

export function baixarArquivoDoBanco(id: string) {
  return apiFetchArquivo(`${rotaDoArquivo(id)}/download`);
}

export function visualizarArquivoDoBanco(id: string) {
  return apiFetchBlob(`${rotaDoArquivo(id)}/preview`);
}
