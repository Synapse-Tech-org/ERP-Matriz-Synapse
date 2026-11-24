"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useInfiniteQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { ehFalhaTransitoria, statusHttpDoErro } from "./abertura-atendimento";
import { mensagensDesde, paginaMensagens } from "./api";
import { atualizarPaginaRecente, type ChaveDoHistorico, type DadosDoHistorico } from "./cache-mensagens";
import { criarLeituraConcorrenteDoHistorico } from "./historico-leitura-concorrente";
import { atualizarReacaoDoClienteDoHistorico, atualizarReacoesDoHistorico } from "./reacoes-cache";
import { calcularBackoffMs, type ConexaoTempoReal, type EstadoConexao, mesclarMensagens } from "./tempo-real";
import type {
  EventoCanonicoAtendimentoTempoReal,
  EventoTempoReal,
  MensagemResposta,
  StatusTempoReal,
} from "./types";
import { useAuthStore } from "@/lib/auth/auth-store";
import { definirConversaAtiva } from "./servico-notificacoes-tempo-real";
import { useHistoricoPorAvisos } from "./use-historico-por-avisos";

const MAX_REPETICOES_TRANSITORIAS = 2;
const LIMITE_STATUS_EM_ESPERA = 128;

function aplicarStatus(cache: QueryClient, chave: ChaveDoHistorico, eventos: StatusTempoReal[]): void {
  cache.setQueryData<DadosDoHistorico>(chave, (atual) => {
    if (!atual) return atual;
    let mudou = false;
    const pages = atual.pages.map((pagina) => {
      let mensagens = pagina.mensagens;
      for (const evento of eventos) {
        const afetadas = mensagens.filter((mensagem) => mensagem.id === evento.mensagemId
          || (evento.idempotencyKey != null && mensagem.idempotencyKey === evento.idempotencyKey));
        if (afetadas.length === 0) continue;
        mensagens = mesclarMensagens(mensagens, afetadas.map((mensagem) => ({
          ...mensagem,
          id: evento.mensagemId,
          statusEntrega: evento.statusEntrega,
          erroEntrega: evento.statusEntrega === "FALHOU" ? mensagem.erroEntrega : null,
          idempotencyKey: mensagem.idempotencyKey ?? evento.idempotencyKey ?? null,
        })));
      }
      if (mensagens === pagina.mensagens) return pagina;
      mudou = true;
      return { ...pagina, mensagens };
    });
    return mudou ? { ...atual, pages } : atual;
  });
}

function esperarRecuperacao(indice: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(concluir, calcularBackoffMs(indice));
    function concluir() {
      clearTimeout(timer);
      signal.removeEventListener("abort", concluir);
      resolve();
    }
    signal.addEventListener("abort", concluir, { once: true });
  });
}

type LacunaDoHistorico = {
  desdeMs: number | null;
  descartouIncremental: boolean;
  cicloDaCargaInicial: number | null;
};

function ultimoInstanteConfirmado(mensagens: MensagemResposta[], inicial: number | null = null): number | null {
  let ultimo = inicial;
  for (const mensagem of mensagens) {
    if (mensagem.id.startsWith("temp-")) continue;
    const instante = Date.parse(mensagem.enviadoEm);
    if (Number.isFinite(instante) && (ultimo == null || instante > ultimo)) ultimo = instante;
  }
  return ultimo;
}

/** Historico por cursor, somado ao fluxo incremental do WebSocket e a reconciliacao de reconexao. */
export function useMensagens(
  atendimentoId: string | null,
  conexao: ConexaoTempoReal,
  estadoConexao: EstadoConexao,
  onMensagemRecebida?: () => void,
  atendimentoParaAssinar: string | null = atendimentoId,
  onEventoEstado?: (evento: EventoCanonicoAtendimentoTempoReal) => void,
  onEventoRecebido?: (evento: EventoTempoReal) => void,
  incrementaisLiberados = true,
  cicloConexao = 0,
  onAcessoAoHistoricoPerdido?: (atendimentoId: string, status: number) => void,
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["mensagens", atendimentoId] as const, [atendimentoId]);
  const [leituraConcorrente] = useState(criarLeituraConcorrenteDoHistorico);
  const ultimoInstanteRef = useRef<number | null>(null);
  const lacunaRef = useRef<LacunaDoHistorico | null>(null);
  const aberturaSemCacheRef = useRef(false);
  const revogadoRef = useRef(false);
  const statusEmEsperaRef = useRef<StatusTempoReal[]>([]);
  const [tentativaManual, setTentativaManual] = useState(0);
  const [falha, setFalha] = useState<{
    atendimentoId: string; cicloConexao: number; tentativaManual: number;
  } | null>(null);
  const retentarRecuperacao = useCallback(() => setTentativaManual((anterior) => anterior + 1), []);
  const onMensagemRecebidaRef = useRef(onMensagemRecebida);
  const onEventoEstadoRef = useRef(onEventoEstado);
  const onEventoRecebidoRef = useRef(onEventoRecebido);
  const onAcessoAoHistoricoPerdidoRef = useRef(onAcessoAoHistoricoPerdido);
  const incrementaisLiberadosRef = useRef(incrementaisLiberados);

  useEffect(() => {
    onMensagemRecebidaRef.current = onMensagemRecebida;
  }, [onMensagemRecebida]);

  useEffect(() => {
    onEventoEstadoRef.current = onEventoEstado;
  }, [onEventoEstado]);

  useEffect(() => {
    onEventoRecebidoRef.current = onEventoRecebido;
  }, [onEventoRecebido]);

  useEffect(() => {
    onAcessoAoHistoricoPerdidoRef.current = onAcessoAoHistoricoPerdido;
  }, [onAcessoAoHistoricoPerdido]);

  useEffect(() => {
    incrementaisLiberadosRef.current = incrementaisLiberados;
  }, [incrementaisLiberados]);

  useEffect(() => {
    // Não reaplicar eventos de outra conversa, seleção ou ciclo de conexão.
    statusEmEsperaRef.current = [];
  }, [atendimentoParaAssinar, cicloConexao, estadoConexao]);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      const base = queryClient.getQueryData<DadosDoHistorico>(queryKey);
      const pagina = await paginaMensagens(atendimentoId as string, pageParam, signal);
      return leituraConcorrente.marcarPagina(pagina, base);
    },
    structuralSharing: leituraConcorrente.compartilhar,
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
    enabled: atendimentoId != null,
  });

  const mensagens = useMemo(
    () =>
      query.data
        ? [...query.data.pages].reverse().flatMap((pagina) => pagina.mensagens)
        : [],
    [query.data],
  );

  const notificarRecuperada = useCallback(() => onMensagemRecebidaRef.current?.(), []);
  const sinalizarAcessoPerdido = useCallback((alvo: string, status: number) => {
    revogadoRef.current = true;
    statusEmEsperaRef.current = [];
    onAcessoAoHistoricoPerdidoRef.current?.(alvo, status);
  }, []);
  useHistoricoPorAvisos(queryClient, queryKey, conexao,
    estadoConexao === "conectado" && atendimentoId === atendimentoParaAssinar,
    incrementaisLiberados, cicloConexao, notificarRecuperada, sinalizarAcessoPerdido);

  useEffect(() => {
    ultimoInstanteRef.current = null;
    lacunaRef.current = null;
    aberturaSemCacheRef.current = queryClient.getQueryData(queryKey) == null;
    revogadoRef.current = false;
    if (!atendimentoParaAssinar) {
      definirConversaAtiva(null);
      conexao.fecharConversa();
      return;
    }
    definirConversaAtiva({ origem: "ATENDIMENTO", id: atendimentoParaAssinar });
    conexao.abrirConversa(atendimentoParaAssinar, (evento) => {
      if (evento.dados.atendimentoId !== atendimentoParaAssinar || revogadoRef.current) {
        return;
      }
      onEventoRecebidoRef.current?.(evento);
      if (evento.tipo === "ATENDIMENTO_ESTADO") {
        onEventoEstadoRef.current?.(evento);
        return;
      }
      // Na primeira conexao e em toda reconexao, o snapshot autorizado governa antes dos
      // incrementais. Frames recebidos nessa janela sao recuperados pelo backfill HTTP abaixo.
      if (!incrementaisLiberadosRef.current) {
        if (evento.tipo === "STATUS" && evento.dados.mensagemId) {
          const espera = statusEmEsperaRef.current;
          if (espera.length >= LIMITE_STATUS_EM_ESPERA) espera.shift();
          espera.push(evento.dados);
        } else if (lacunaRef.current) {
          lacunaRef.current.descartouIncremental = true;
        }
        return;
      }
      if (evento.tipo === "MENSAGEM") {
        if (!evento.dados.mensagemId) return;
        if (lacunaRef.current && !queryClient.getQueryData(queryKey)) {
          lacunaRef.current.descartouIncremental = true;
        }
        const nova: MensagemResposta = {
          id: evento.dados.mensagemId,
          atendimentoId: evento.dados.atendimentoId,
          remetenteTipo: evento.dados.remetenteTipo,
          remetenteId: evento.dados.remetenteId,
          remetenteNome: null,
          tipo: evento.dados.tipo,
          conteudo: evento.dados.conteudo,
          midiaUrl: evento.dados.midiaUrl,
          midiaMetadados: evento.dados.midiaMetadados,
          opcoes: evento.dados.opcoes,
          statusEntrega: evento.dados.statusEntrega,
          erroEntrega: null,
          enviadoEm: evento.dados.enviadoEm,
          citacao: evento.dados.citacao ?? null,
          idempotencyKey: evento.dados.idempotencyKey ?? null,
        };
        atualizarPaginaRecente(queryClient, queryKey, (atuais) => mesclarMensagens(atuais, [nova]));
        onMensagemRecebidaRef.current?.();
      } else if (evento.tipo === "STATUS") {
        if (!evento.dados.mensagemId) return;
        aplicarStatus(queryClient, queryKey, [evento.dados]);
      } else if (evento.tipo === "REACAO") {
        atualizarReacoesDoHistorico(
          queryClient,
          queryKey,
          evento.dados.mensagemId,
          evento.dados.reacoes,
          { atorId: evento.dados.atorId, emojiDoAtor: evento.dados.emojiDoAtor },
          useAuthStore.getState().usuarioId,
        );
      } else if (evento.tipo === "REACAO_CLIENTE") {
        atualizarReacaoDoClienteDoHistorico(
          queryClient,
          queryKey,
          evento.dados.mensagemId,
          evento.dados.emoji,
        );
      }
    });
    return () => {
      definirConversaAtiva(null);
      conexao.fecharConversa();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a assinatura muda somente com a conversa
  }, [atendimentoParaAssinar]);

  useEffect(() => {
    ultimoInstanteRef.current = ultimoInstanteConfirmado(mensagens, ultimoInstanteRef.current);
  }, [mensagens]);

  useEffect(() => {
    if (!atendimentoId || atendimentoId !== atendimentoParaAssinar || estadoConexao !== "conectado"
      || !incrementaisLiberados || !query.data || revogadoRef.current || statusEmEsperaRef.current.length === 0) return;
    const confirmados = statusEmEsperaRef.current;
    statusEmEsperaRef.current = [];
    aplicarStatus(queryClient, queryKey, confirmados);
  }, [atendimentoId, atendimentoParaAssinar, estadoConexao, incrementaisLiberados, query.data, queryClient, queryKey]);

  useEffect(() => {
    if (!atendimentoId || atendimentoId !== atendimentoParaAssinar || revogadoRef.current) return;
    // Congela o limite inferior ao perder o stream. Frames posteriores, respostas locais e
    // nova reconexão não podem empurrá-lo para além da lacuna ainda não recuperada.
    const lacuna = lacunaRef.current ??= {
      desdeMs: ultimoInstanteRef.current,
      descartouIncremental: false,
      cicloDaCargaInicial: aberturaSemCacheRef.current && estadoConexao === "conectado"
        ? cicloConexao : null,
    };
    aberturaSemCacheRef.current = false;
    if (estadoConexao !== "conectado" || lacuna.cicloDaCargaInicial !== cicloConexao) {
      lacuna.cicloDaCargaInicial = null;
    }
    if (estadoConexao !== "conectado" || !incrementaisLiberados) return;

    const cache = queryClient.getQueryCache();
    const filtro = { queryKey, exact: true };
    const entrada = cache.find<DadosDoHistorico>(filtro);
    if (!entrada) return;
    const alvo = atendimentoId;
    const consulta = entrada;
    const cancelamento = new AbortController();
    const { signal } = cancelamento;
    const vigente = () => !signal.aborted && cache.find(filtro) === entrada;
    const cancelarAoRemover = cache.subscribe((evento) => {
      if (evento.type === "removed" && evento.query === entrada) cancelamento.abort();
    });
    async function recuperarLacuna() {
      if (lacuna.desdeMs == null) {
        const cargaEmCurso = !consulta.state.data && consulta.state.fetchStatus !== "idle"
          ? consulta.promise : undefined;
        if (cargaEmCurso || lacuna.cicloDaCargaInicial != null) {
          const inicial = cargaEmCurso ? await cargaEmCurso : consulta.state.data;
          if (!vigente()) return;
          // A abertura com o socket já conectado e sem frames perdidos aproveita a carga inicial,
          // inclusive quando ela acaba antes do snapshot. Cache preexistente não prova isso.
          if (inicial && lacuna.cicloDaCargaInicial != null && !lacuna.descartouIncremental) return;
          lacuna.desdeMs = ultimoInstanteConfirmado(inicial?.pages[0]?.mensagens ?? []);
        }
      }

      if (lacuna.desdeMs != null) {
        // O endpoint usa `>`; um milissegundo de sobreposição cobre o último instante completo
        // (inclusive empates e microssegundos) e a fusão já deduplica as identidades.
        const desde = new Date(lacuna.desdeMs - 1).toISOString();
        const novas = await mensagensDesde(alvo, desde, signal);
        if (vigente() && novas.length > 0) {
          atualizarPaginaRecente(queryClient, queryKey, (atuais) => mesclarMensagens(atuais, novas));
        }
        return;
      }

      const recente = await paginaMensagens(alvo, null, signal);
      if (!vigente()) return;
      queryClient.setQueryData<DadosDoHistorico>(queryKey, (atual) => {
        if (!atual?.pages.length) return { pages: [recente], pageParams: [null] };
        const [primeira, ...anteriores] = atual.pages;
        return {
          ...atual,
          pages: [{
            proximoCursor: primeira.mensagens.some((mensagem) => !mensagem.id.startsWith("temp-"))
              ? primeira.proximoCursor : recente.proximoCursor,
            mensagens: mesclarMensagens(primeira.mensagens, recente.mensagens),
          }, ...anteriores],
        };
      });
    }

    async function recuperar() {
      for (let tentativa = 0; vigente(); tentativa++) {
        try {
          await recuperarLacuna();
          if (!vigente()) return;
          lacunaRef.current = null;
          setFalha(null);
          return;
        } catch (erro) {
          if (!vigente()) return;
          const httpStatus = statusHttpDoErro(erro);
          if (httpStatus === 403 || httpStatus === 404) {
            revogadoRef.current = true;
            queryClient.removeQueries(filtro);
            onAcessoAoHistoricoPerdidoRef.current?.(alvo, httpStatus);
            return;
          }
          if (!ehFalhaTransitoria(erro) || tentativa >= MAX_REPETICOES_TRANSITORIAS) {
            console.info("[atendimento.historico]", {
              etapa: "recuperacao_falhou", atendimentoId: alvo, cicloConexao, httpStatus,
              tentativas: tentativa + 1,
            });
            setFalha({ atendimentoId: alvo, cicloConexao, tentativaManual });
            return;
          }
          await esperarRecuperacao(tentativa, signal);
        }
      }
    }

    void recuperar();
    return () => {
      cancelamento.abort();
      cancelarAoRemover();
    };
  }, [queryClient, queryKey, atendimentoId, atendimentoParaAssinar, estadoConexao,
    incrementaisLiberados, cicloConexao, tentativaManual]);

  return {
    ...query,
    data: mensagens,
    isErrorRecuperacao: falha?.atendimentoId === atendimentoId
      && falha.cicloConexao === cicloConexao && falha.tentativaManual === tentativaManual,
    retentarRecuperacao,
  };
}
