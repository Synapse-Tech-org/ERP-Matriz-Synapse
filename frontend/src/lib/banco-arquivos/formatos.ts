import { arquivoCompativel, TIPOS_DE_ANEXO_ACEITOS_NO_ATENDIMENTO } from "@/lib/atendimento/arquivos-do-composer";

import type { TipoDoBanco } from "./api";

const TIPO_POR_EXTENSAO: Readonly<Partial<Record<string, TipoDoBanco>>> = {
  ".pdf": "PDF",
  ".doc": "DOC",
  ".docx": "DOCX",
  ".xls": "XLS",
  ".xlsx": "XLSX",
  ".ppt": "PPT",
  ".pptx": "PPTX",
  ".txt": "TXT",
  ".jpg": "IMAGEM",
  ".jpeg": "IMAGEM",
  ".png": "IMAGEM",
  ".webp": "IMAGEM",
  ".ogg": "AUDIO",
  ".oga": "AUDIO",
  ".opus": "AUDIO",
  ".mp3": "AUDIO",
  ".m4a": "AUDIO",
  ".amr": "AUDIO",
  ".aac": "AUDIO",
  ".mp4": "VIDEO",
  ".m4v": "VIDEO",
  ".3gp": "VIDEO",
  ".3gpp": "VIDEO",
  ".dwg": "DWG",
};

// DWG pertence à biblioteca e o servidor valida o formato real antes de armazenar.
export const ARQUIVOS_ACEITOS_NO_BANCO = `${TIPOS_DE_ANEXO_ACEITOS_NO_ATENDIMENTO},.dwg`;

export function formatoAceitoNoBanco(arquivo: File) {
  return arquivoCompativel(arquivo, ARQUIVOS_ACEITOS_NO_BANCO);
}

export function extensao(nome: string) {
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? nome.slice(ponto) : "";
}

export function tipoParaIconeDaFila(arquivo: File): TipoDoBanco | undefined {
  const sufixo = extensao(arquivo.name).toLowerCase();
  if (sufixo === ".mp4" && arquivo.type === "audio/mp4") return "AUDIO";
  return TIPO_POR_EXTENSAO[sufixo];
}
