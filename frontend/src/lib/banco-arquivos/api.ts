import { apiFetch, apiFetchArquivo, apiFetchBlob } from "@/lib/api/http-client";

const ROTA = "/api/v1/banco-arquivos";

export const TIPOS_DO_BANCO_EM_DESTAQUE = ["PDF", "XLSX", "DOCX", "IMAGEM", "DWG"] as const;
export const TIPOS_DO_BANCO_ADICIONAIS = ["DOC", "XLS", "PPT", "PPTX", "TXT", "AUDIO", "VIDEO"] as const;
export const ORDENS_DO_BANCO = ["recentes", "nome", "tamanho"] as const;
export const CHAVE_DO_BANCO = ["banco-arquivos"] as const;

export type TipoDoBanco = (typeof TIPOS_DO_BANCO_EM_DESTAQUE | typeof TIPOS_DO_BANCO_ADICIONAIS)[number];
export type OrdemDoBanco = (typeof ORDENS_DO_BANCO)[number];

export interface PastaDoBanco {
  id: string;
  nome: string;
  geral: boolean;
}

export interface ArquivoDoBanco {
  id: string;
  nome: string;
  pasta: string;
  tipo: TipoDoBanco;
  mimeType: string;
  tamanhoBytes: number;
  descricao: string | null;
  criadoEm: string;
}

export interface FiltrosDoBanco {
  pasta: string | null;
  tipo: TipoDoBanco | null;
  busca: string;
  ordem: OrdemDoBanco;
  pagina: number;
  tamanho: number;
}

export interface ResultadoDoBanco {
  itens: ArquivoDoBanco[];
  total: number;
  contagemPorPasta: Partial<Record<string, number>>;
  usadoBytes: number;
  limiteBytes: number;
  limiteArquivoBytes: number;
  limiteDescricao: number;
}

export interface EdicaoDoBanco {
  nome: string;
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

export function listarPastasDoBanco(signal?: AbortSignal) {
  return apiFetch<PastaDoBanco[]>(`${ROTA}/pastas`, { signal });
}

export function criarPastaDoBanco(nome: string) {
  return apiFetch<PastaDoBanco>(`${ROTA}/pastas`, { method: "POST", body: JSON.stringify({ nome }) });
}

export function renomearPastaDoBanco(id: string, nome: string) {
  return apiFetch<PastaDoBanco>(`${ROTA}/pastas/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ nome }),
  });
}

export function moverArquivoDoBanco(id: string, pasta: string) {
  return apiFetch<ArquivoDoBanco>(`${rotaDoArquivo(id)}/pasta`, {
    method: "PATCH", body: JSON.stringify({ pasta }),
  });
}

export function adicionarArquivoAoBanco(arquivo: File, pasta: string, descricao: string) {
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

const MAXIMO_DE_MINIATURAS_EM_CURSO = 4;
const miniaturasNaFila: Array<() => void> = [];
let miniaturasEmCurso = 0;

export async function obterMiniaturaDoBanco(id: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (miniaturasEmCurso < MAXIMO_DE_MINIATURAS_EM_CURSO) {
    miniaturasEmCurso += 1;
  } else {
    await new Promise<void>((resolver, rejeitar) => {
      function iniciar() {
        signal?.removeEventListener("abort", cancelar);
        resolver();
      }
      function cancelar() {
        miniaturasNaFila.splice(miniaturasNaFila.indexOf(iniciar), 1);
        rejeitar(signal?.reason);
      }
      miniaturasNaFila.push(iniciar);
      signal?.addEventListener("abort", cancelar, { once: true });
    });
  }

  try {
    signal?.throwIfAborted();
    const blob = await apiFetchBlob(`${rotaDoArquivo(id)}/miniatura`, signal);
    return blob.size > 0 && blob.type === "image/png" ? blob : null;
  } finally {
    const proxima = miniaturasNaFila.shift();
    if (proxima) proxima();
    else miniaturasEmCurso -= 1;
  }
}
