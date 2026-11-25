"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { IconeFrontendV2, type NomeIconeFrontendV2 } from "@/components/shell/icone-frontend-v2";
import { ErroDeApi } from "@/lib/api/errors";
import { obterMiniaturaDoBanco, type ArquivoDoBanco, type TipoDoBanco } from "@/lib/banco-arquivos/api";
import { extensao } from "@/lib/banco-arquivos/formatos";
import type { Textos } from "@/lib/config/schema";

import estilos from "./banco-de-arquivos.module.css";

export type TextosDoBanco = Textos["bancoArquivos"];

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

export const ICONES_DOS_TIPOS: Record<TipoDoBanco, { filtro: NomeIconeFrontendV2; arquivo: NomeIconeFrontendV2 }> = {
  PDF: { filtro: "file-pdf-2-line", arquivo: "file-pdf-2-fill" },
  XLS: { filtro: "file-excel-2-line", arquivo: "file-excel-2-fill" },
  XLSX: { filtro: "file-excel-2-line", arquivo: "file-excel-2-fill" },
  DOC: { filtro: "file-word-2-line", arquivo: "file-word-2-fill" },
  DOCX: { filtro: "file-word-2-line", arquivo: "file-word-2-fill" },
  PPT: { filtro: "file-ppt-2-line", arquivo: "file-ppt-2-fill" },
  PPTX: { filtro: "file-ppt-2-line", arquivo: "file-ppt-2-fill" },
  TXT: { filtro: "file-text-line", arquivo: "file-text-fill" },
  IMAGEM: { filtro: "image-line", arquivo: "image-fill" },
  AUDIO: { filtro: "file-music-line", arquivo: "file-music-fill" },
  VIDEO: { filtro: "file-video-line", arquivo: "file-video-fill" },
  DWG: { filtro: "ruler-2-line", arquivo: "ruler-2-line" },
};

export function formatarBytes(bytes: number) {
  if (bytes < 1024) return `${NUMERO.format(bytes)} B`;
  if (bytes < 1024 ** 2) return `${NUMERO.format(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${NUMERO.format(bytes / 1024 ** 2)} MB`;
  return `${NUMERO.format(bytes / 1024 ** 3)} GB`;
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

export function MiniaturaDoArquivo({ arquivo, abrir, t }: {
  arquivo: ArquivoDoBanco;
  abrir: (arquivo: ArquivoDoBanco) => void;
  t: TextosDoBanco;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  const [proximo, definirProximo] = useState(typeof IntersectionObserver === "undefined");
  const suportaMiniatura = arquivo.tipo === "IMAGEM" || arquivo.tipo === "PDF";

  useEffect(() => {
    if (!suportaMiniatura || proximo || !botao.current) return;
    const observador = new IntersectionObserver(([entrada]) => {
      if (entrada?.isIntersecting) {
        observador.disconnect();
        definirProximo(true);
      }
    });
    observador.observe(botao.current);
    return () => observador.disconnect();
  }, [proximo, suportaMiniatura]);

  const miniatura = useQuery({
    queryKey: ["miniatura-banco-arquivos", arquivo.id],
    queryFn: ({ signal }) => obterMiniaturaDoBanco(arquivo.id, signal),
    enabled: suportaMiniatura && proximo,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const mostrarImagem = useCallback((imagem: HTMLImageElement | null) => {
    if (!imagem || !miniatura.data) return;
    const url = URL.createObjectURL(miniatura.data);
    imagem.src = url;
    return () => URL.revokeObjectURL(url);
  }, [miniatura.data]);

  return (
    <button ref={botao} type="button" className={estilos.miniatura} data-tipo={arquivo.tipo}
      aria-label={`${t.detalhes} · ${arquivo.nome}`} onClick={() => abrir(arquivo)}>
      {arquivo.tipo === "IMAGEM" ? (
        <span className={estilos.iconeImagem} aria-hidden><IconeFrontendV2 nome="image-2-line" /></span>
      ) : <IconeDoArquivo tipo={arquivo.tipo} grande />}
      {miniatura.data && (
        // eslint-disable-next-line @next/next/no-img-element -- PNG já reduzido e autenticado, servido por URL blob.
        <img ref={mostrarImagem} className={estilos.miniaturaReal} alt="" decoding="async"
          onError={(evento) => { evento.currentTarget.hidden = true; }} />
      )}
      <SeloDoArquivo arquivo={arquivo} />
    </button>
  );
}
