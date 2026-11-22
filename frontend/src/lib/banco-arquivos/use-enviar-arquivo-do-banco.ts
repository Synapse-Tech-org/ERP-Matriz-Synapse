"use client";

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ErroDeApi } from "@/lib/api/errors";
import { apiFetch } from "@/lib/api/http-client";
import { useTextos } from "@/lib/config/textos-provider";

export const LIMITE_LEGENDA_ARQUIVO_BANCO = 1024;

interface PedidoDeEnvio {
  arquivoId: string;
  atendimentoId: string;
  legenda: string;
}

interface ResultadoDoEnvio {
  atendimentoId: string;
  mensagemId: string;
}

export function useEnviarArquivoDoBanco() {
  const textos = useTextos().bancoArquivosEnvio;
  const cache = useQueryClient();
  const tentativa = useRef<(PedidoDeEnvio & { chave: string }) | null>(null);
  const emCurso = useRef(false);

  const envio = useMutation({
    mutationFn: ({ arquivoId, atendimentoId, legenda, chave }: NonNullable<typeof tentativa.current>) =>
      apiFetch<ResultadoDoEnvio>(`/api/v1/banco-arquivos/${encodeURIComponent(arquivoId)}/enviar`, {
        method: "POST",
        headers: { "Idempotency-Key": chave },
        body: JSON.stringify({ atendimentoId, legenda: legenda || null }),
      }),
    onSuccess: ({ atendimentoId }) => {
      void cache.invalidateQueries({ queryKey: ["atendimentos"] });
      void cache.invalidateQueries({ queryKey: ["mensagens", atendimentoId] });
    },
    onSettled: () => { emCurso.current = false; },
  });

  function enviar(pedido: PedidoDeEnvio, opcoes?: { onSuccess?: (resultado: ResultadoDoEnvio) => void }) {
    if (emCurso.current) return;
    const legenda = pedido.legenda.trim();
    const anterior = tentativa.current;
    if (anterior?.arquivoId !== pedido.arquivoId || anterior?.atendimentoId !== pedido.atendimentoId || anterior?.legenda !== legenda) {
      tentativa.current = { ...pedido, legenda, chave: crypto.randomUUID() };
    }
    if (!tentativa.current) return;
    emCurso.current = true;
    envio.mutate(tentativa.current, opcoes);
  }

  function mensagemDoErro(erro: unknown) {
    if (!(erro instanceof ErroDeApi)) return textos.erroEnvio;
    switch (erro.problema?.motivo) {
      case "janela_fechada": return textos.janelaFechada;
      case "tipo_incompativel": return textos.tipoIncompativel;
    }
    switch (erro.status) {
      case 403: return textos.semPermissao;
      case 404:
      case 409: return textos.indisponivel;
      case 413: return textos.arquivoGrande;
      case 429: return textos.limite;
      default: return textos.erroEnvio;
    }
  }

  return {
    enviar,
    emAndamento: () => emCurso.current,
    isPending: envio.isPending,
    isSuccess: envio.isSuccess,
    error: envio.error,
    mensagemErro: envio.isError ? mensagemDoErro(envio.error) : null,
  };
}
