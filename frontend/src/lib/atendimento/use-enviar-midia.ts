"use client";

import { useRef } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { ErroDeApi } from "@/lib/api/errors";
import { invalidarArquivosDoLead } from "@/lib/lead/invalidar-arquivos";

import { enviarMidia } from "./api";
import { atualizarPainelDeAtendimentos } from "./atualizacao-do-painel";
import { atualizarPaginaRecente, identidadeAutenticada, type DadosDoHistorico } from "./cache-mensagens";
import { confirmarEnvioNoHistorico } from "./confirmar-envio";
import { reconciliarEnvioAmbiguo } from "./reconciliar-envio";
import { mesclarMensagens } from "./tempo-real";
import type { EnvioResposta, MensagemResposta, TipoMensagem } from "./types";

export interface VariaveisEnvioMidia {
  atendimentoId: string;
  leadId: string;
  arquivo: File;
  legenda?: string;
  onProgresso?: (percentual: number) => void;
  resposta?: { mensagemId: string; enviadoEm: string };
  citacao?: MensagemResposta["citacao"];
  gravacaoDoComposer?: boolean;
  idempotencyKey?: string;
  loteFotosId?: string;
}

function tipoDoArquivo(mimetype: string): TipoMensagem {
  if (mimetype.startsWith("image/")) return "IMAGEM";
  if (mimetype.startsWith("audio/")) return "AUDIO";
  if (mimetype.startsWith("video/")) return "VIDEO";
  return "DOCUMENTO";
}

type ContextoOtimista = {
  queryKey: readonly ["mensagens", string];
  idOtimista: string;
  criadoEm: string;
  otimista: MensagemResposta;
};

/** As prévias acompanham o cache do histórico: o composer pode desmontar durante o upload. */
function acompanharPrevias(cache: QueryClient, chave: ContextoOtimista["queryKey"], urls: string[]) {
  const consulta = cache.getQueryCache().find({ queryKey: chave, exact: true });
  if (!consulta) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    return;
  }
  const previas = new Set(urls);
  const parar = cache.getQueryCache().subscribe((evento) => {
    if (evento.query !== consulta || (evento.type !== "updated" && evento.type !== "removed")) return;
    const presentes = evento.type === "removed" ? [] : (
      (consulta.state.data as DadosDoHistorico | undefined)?.pages.flatMap(({ mensagens }) =>
        mensagens.map(({ midiaUrl }) => midiaUrl)) ?? []);
    const urlsPresentes = new Set(presentes);
    for (const url of previas) {
      if (!urlsPresentes.has(url)) {
        URL.revokeObjectURL(url);
        previas.delete(url);
      }
    }
    if (!previas.size) parar();
  });
}

function erroDefinitivo(erro: unknown): boolean {
  return erro instanceof ErroDeApi
    && erro.status >= 400
    && erro.status < 500
    && ![408, 425, 429].includes(erro.status);
}

function respostaDaReconciliacao(
  real: MensagemResposta,
  variaveis: VariaveisEnvioMidia,
): EnvioResposta {
  return {
    atendimentoId: real.atendimentoId ?? variaveis.atendimentoId,
    mensagemId: real.id,
    statusEntrega: real.statusEntrega,
    enviadoEm: real.enviadoEm,
    transferiuOLead: true,
    idempotencyKey: real.idempotencyKey ?? variaveis.idempotencyKey ?? null,
  };
}

/**
 * Mesmo contrato de estado de {@link import("./use-enviar-mensagem").useEnviarMensagem}: bolha
 * `PENDENTE` de verdade assim que o `mutate` roda; falhas de transporte ficam pendentes durante a
 * reconciliação pela chave. A diferença é a preview local — `URL.createObjectURL`, válida só nesta
 * sessão do browser — porque o backend não devolve a URL assinada na resposta de envio.
 */
export function useEnviarMidia() {
  const queryClient = useQueryClient();
  const contextos = useRef(new Map<string, ContextoOtimista>());
  const chavesReconciliadas = useRef(new Set<string>());

  function preparar(variaveis: VariaveisEnvioMidia, ordemLocalDoLoteEm?: string): ContextoOtimista {
    const queryKey = ["mensagens", variaveis.atendimentoId] as const;
    const chave = variaveis.idempotencyKey ??= crypto.randomUUID();
    const idOtimista = `temp-${chave}`;
    const identidade = identidadeAutenticada(queryClient);
    const criadoEm = new Date().toISOString();
    const otimista: MensagemResposta = {
      id: idOtimista,
      atendimentoId: variaveis.atendimentoId,
      remetenteTipo: "ATENDENTE",
      remetenteId: identidade.id,
      remetenteNome: identidade.nome,
      tipo: tipoDoArquivo(variaveis.arquivo.type),
      conteudo: null,
      midiaUrl: URL.createObjectURL(variaveis.arquivo),
      midiaMetadados: JSON.stringify({
        nome: variaveis.arquivo.name,
        mimetype: variaveis.arquivo.type,
        tamanho: variaveis.arquivo.size,
        legenda: variaveis.legenda,
        loteFotosId: variaveis.loteFotosId,
      }),
      opcoes: null,
      statusEntrega: "PENDENTE",
      erroEntrega: null,
      enviadoEm: criadoEm,
      ordemLocalDoLoteEm,
      citacao: variaveis.citacao ?? null,
      idempotencyKey: chave,
    };
    const contexto = { queryKey, idOtimista, criadoEm, otimista };
    contextos.current.set(chave, contexto);
    return contexto;
  }

  /** Publica as prévias antes do primeiro upload; a fila HTTP continua sequencial. */
  function prepararLote(envios: VariaveisEnvioMidia[]) {
    const instante = Date.now();
    const preparados = envios.map((envio, indice) => preparar(envio, new Date(instante + indice).toISOString()));
    const chave = preparados[0]?.queryKey;
    if (!chave) return;
    atualizarPaginaRecente(queryClient, chave, (atuais) => [...atuais, ...preparados.map(({ otimista }) => otimista)]);
    acompanharPrevias(queryClient, chave, preparados.flatMap(({ otimista }) => otimista.midiaUrl ?? []));
  }

  const mutacao = useMutation({
    mutationFn: async (variaveis: VariaveisEnvioMidia) => {
      try {
        return await enviarMidia(
          variaveis.atendimentoId,
          variaveis.arquivo,
          variaveis.legenda,
          variaveis.onProgresso ?? (() => {}),
          variaveis.resposta,
          variaveis.gravacaoDoComposer,
          variaveis.idempotencyKey,
          ...(variaveis.loteFotosId ? [variaveis.loteFotosId] as const : []),
        );
      } catch (erro) {
        const chave = variaveis.idempotencyKey;
        const contexto = chave ? contextos.current.get(chave) : undefined;
        if (erroDefinitivo(erro) || !chave || !contexto) throw erro;

        const real = await reconciliarEnvioAmbiguo(
          queryClient,
          variaveis.atendimentoId,
          contexto.queryKey,
          contexto.idOtimista,
          chave,
          contexto.criadoEm,
        );
        if (!real) throw erro;
        chavesReconciliadas.current.add(chave);
        return respostaDaReconciliacao(real, variaveis);
      }
    },
    onMutate: (variaveis) => {
      const preparado = variaveis.idempotencyKey ? contextos.current.get(variaveis.idempotencyKey) : null;
      if (preparado) return preparado;
      const contexto = preparar(variaveis);
      atualizarPaginaRecente(queryClient, contexto.queryKey, (atuais) => {
        const local = atuais.find((mensagem) => mensagem.id === contexto.idOtimista);
        if (local) {
          if (contexto.otimista.midiaUrl) URL.revokeObjectURL(contexto.otimista.midiaUrl);
          contexto.otimista = { ...local, statusEntrega: "PENDENTE", erroEntrega: null };
          return atuais.map((mensagem) => mensagem === local ? contexto.otimista : mensagem);
        }
        return mesclarMensagens(atuais, [contexto.otimista]);
      });
      return contexto;
    },
    onError: (erro, variaveis, contexto) => {
      if (!contexto) {
        return;
      }
      if (variaveis.idempotencyKey) contextos.current.delete(variaveis.idempotencyKey);
      if (variaveis.resposta && !contexto.otimista.ordemLocalDoLoteEm) {
        // Respostas/citações mantêm o comportamento existente: sem confirmação da API, a
        // referência otimista é retirada para não deixar um vínculo local que nunca foi aceito.
        atualizarPaginaRecente(queryClient, contexto.queryKey, (atual) =>
          atual.filter((mensagem) => mensagem.id !== contexto.idOtimista),
        );
        if (contexto.otimista.midiaUrl?.startsWith("blob:")) URL.revokeObjectURL(contexto.otimista.midiaUrl);
        return;
      }
      const erroDefinitivo = erro instanceof ErroDeApi ? {
        codigo: erro.status,
        titulo: erro.message,
      } : null;
      atualizarPaginaRecente(queryClient, contexto.queryKey, (atual) =>
        atual.map((mensagem) =>
          mensagem.id === contexto.idOtimista
            ? ({
                ...mensagem,
                statusEntrega: "FALHOU",
                erroEntrega: erroDefinitivo ?? { codigo: -1, titulo: null },
              } as MensagemResposta)
            : mensagem,
        ),
      );
    },
    onSuccess: (resposta, variaveis, contexto) => {
      void invalidarArquivosDoLead(queryClient, variaveis.leadId);
      if (!contexto) {
        return;
      }
      const reconciliada = resposta.idempotencyKey != null
        && chavesReconciliadas.current.delete(resposta.idempotencyKey);
      if (variaveis.idempotencyKey) contextos.current.delete(variaveis.idempotencyKey);
      const identidade = identidadeAutenticada(queryClient);
      atualizarPaginaRecente(queryClient, contexto.queryKey, (atual) =>
        confirmarEnvioNoHistorico(atual, contexto.otimista, resposta, identidade),
      );
      if (resposta.transferiuOLead || reconciliada) {
        atualizarPainelDeAtendimentos(queryClient, { atendimentoId: resposta.atendimentoId });
      }
    },
  });
  return { ...mutacao, prepararLote };
}
