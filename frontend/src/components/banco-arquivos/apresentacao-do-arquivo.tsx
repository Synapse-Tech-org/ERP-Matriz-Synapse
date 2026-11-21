"use client";

import { IconeFrontendV2, type NomeIconeFrontendV2 } from "@/components/shell/icone-frontend-v2";
import { ErroDeApi } from "@/lib/api/errors";
import type { ArquivoDoBanco, TipoDoBanco } from "@/lib/banco-arquivos/api";
import type { Textos } from "@/lib/config/schema";

import estilos from "./banco-de-arquivos.module.css";

export type TextosDoBanco = Textos["bancoArquivos"];

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

export const ICONES_DOS_TIPOS: Record<TipoDoBanco, { filtro: NomeIconeFrontendV2; arquivo: NomeIconeFrontendV2 }> = {
  PDF: { filtro: "file-pdf-2-line", arquivo: "file-pdf-2-fill" },
  XLSX: { filtro: "file-excel-2-line", arquivo: "file-excel-2-fill" },
  DOCX: { filtro: "file-word-2-line", arquivo: "file-word-2-fill" },
  IMAGEM: { filtro: "image-line", arquivo: "image-fill" },
  DWG: { filtro: "ruler-2-line", arquivo: "ruler-2-line" },
};
export const EXTENSOES_ACEITAS = [".pdf", ".docx", ".xlsx", ".dwg", ".jpg", ".jpeg", ".png"];

export function formatarBytes(bytes: number) {
  if (bytes < 1024) return `${NUMERO.format(bytes)} B`;
  if (bytes < 1024 ** 2) return `${NUMERO.format(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${NUMERO.format(bytes / 1024 ** 2)} MB`;
  return `${NUMERO.format(bytes / 1024 ** 3)} GB`;
}

export function extensao(nome: string) {
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? nome.slice(ponto) : "";
}

export function tipoDoNome(nome: string): TipoDoBanco | null {
  const sufixo = extensao(nome).toUpperCase().slice(1);
  switch (sufixo) {
    case "PDF":
    case "XLSX":
    case "DOCX":
    case "DWG": return sufixo;
    case "JPG":
    case "JPEG":
    case "PNG": return "IMAGEM";
    default: return null;
  }
}

export function formatarDataArquivo(arquivo: ArquivoDoBanco) {
  return DATA_CURTA.format(new Date(arquivo.criadoEm));
}

export function mensagemDoErro(erro: unknown, t: TextosDoBanco, fallback = t.erroOperacao) {
  if (erro instanceof ErroDeApi) {
    switch (erro.status) {
      case 403: return t.erroAcesso;
      case 413: return t.erroTamanho;
      case 415: return t.erroTipo;
      case 429: return t.erroLimite;
      case 507: return t.erroQuota;
      case 400:
      case 422: return erro.problema?.detail ?? t.erroInvalido;
    }
  }
  return fallback;
}

export function IconeDoArquivo({ tipo, grande = false }: { tipo: TipoDoBanco; grande?: boolean }) {
  return (
    <span aria-hidden data-tipo={tipo} data-grande={grande || undefined} className={estilos.iconeDoArquivo}>
      <IconeFrontendV2 nome={ICONES_DOS_TIPOS[tipo].arquivo} />
    </span>
  );
}

export function SeloDoArquivo({ arquivo }: { arquivo: ArquivoDoBanco }) {
  return (
    <span className={estilos.selo} data-tipo={arquivo.tipo}>
      {extensao(arquivo.nome).slice(1).toUpperCase() || arquivo.tipo}
    </span>
  );
}
