import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";

import { statusHttpDoErro } from "./abertura-atendimento";
import { paginaMensagens } from "./api";
import type { ChaveDoHistorico, DadosDoHistorico } from "./cache-mensagens";
import { mesclarMensagens, type ConexaoTempoReal } from "./tempo-real";

// A fila pessoal costuma chegar antes do frame do chat. Só consultar se o frame realmente faltou.
const JANELA_DE_AVISOS_MS = 1_000;
const LIMITE_AVISOS_EM_ESPERA = 64;

/** Usa o aviso pessoal só como pista. O conteúdo entra pelo GET autorizado, nunca por esse aviso. */
export function useHistoricoPorAvisos(
  cache: QueryClient,
  chave: ChaveDoHistorico,
  conexao: ConexaoTempoReal,
  conectado: boolean,
  autorizado: boolean,
  ciclo: number,
  aoRecuperar: (atendimentoId: string) => void,
  aoPerderAcesso: (atendimentoId: string, status: number) => void,
): void {
  const pendentesRef = useRef(new Set<string>());

  useEffect(() => {
    pendentesRef.current = new Set();
  }, [chave, conectado, ciclo]);

  useEffect(() => {
    const atendimentoId = chave[1];
    if (!conectado || !atendimentoId) return;
    const pendentes = pendentesRef.current;
    const filtro = { queryKey: chave, exact: true };
    const consultas = cache.getQueryCache();
    const consulta = consultas.find<DadosDoHistorico>(filtro);
    if (!consulta) return;
    const cancelamento = new AbortController();
    const { signal } = cancelamento;
    const alvo = atendimentoId;
    const entrada = consulta;
    const vigente = () => !signal.aborted && consultas.find(filtro) === consulta;
    const visivel = () => document.visibilityState !== "hidden";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let processando = false;

    function agendar() {
      if (autorizado && vigente() && visivel() && pendentes.size > 0 && !processando && timer === undefined) {
        timer = setTimeout(() => { timer = undefined; void recuperar(); }, JANELA_DE_AVISOS_MS);
      }
    }

    async function recuperar() {
      if (!vigente() || !visivel()) return;
      processando = true;
      let lote: string[] = [];
      try {
        // Se o GET normal já está rodando, deixe-o atender aos avisos que conseguir primeiro.
        const leituraEmCurso = entrada.state.fetchStatus === "fetching" ? entrada.promise : undefined;
        await leituraEmCurso?.catch(() => undefined);
        if (!vigente() || !visivel()) return;
        const carregadas = new Set(cache.getQueryData<DadosDoHistorico>(chave)?.pages
          .flatMap((pagina) => pagina.mensagens.map(({ id }) => id)));
        lote = [...pendentes];
        const faltam = new Set(lote.filter((id) => !carregadas.has(id)));
        if (faltam.size === 0) return;
        const recente = await paginaMensagens(alvo, null, signal);
        if (!vigente()) return;
        cache.setQueryData<DadosDoHistorico>(chave, (atual) => {
          if (!atual?.pages.length) return { pages: [recente], pageParams: [null] };
          const [primeira, ...anteriores] = atual.pages;
          const idsAnteriores = new Set(anteriores.flatMap((pagina) => pagina.mensagens.map(({ id }) => id)));
          const mensagens = mesclarMensagens(primeira.mensagens,
            recente.mensagens.filter((mensagem) => !idsAnteriores.has(mensagem.id)));
          return { ...atual, pages: [{ ...primeira, mensagens }, ...anteriores] };
        });
        if (recente.mensagens.some(({ id }) => faltam.has(id))) aoRecuperar(alvo);
      } catch (erro) {
        if (!vigente()) return;
        const httpStatus = statusHttpDoErro(erro);
        if (httpStatus === 403 || httpStatus === 404) {
          pendentes.clear();
          cache.removeQueries(filtro);
          aoPerderAcesso(alvo, httpStatus);
        } else {
          console.info("[atendimento.historico]", { etapa: "aviso_recuperacao_falhou", cicloConexao: ciclo, httpStatus });
        }
      } finally {
        // Cancelar pela suspensão do acesso não consome a pista; reavaliá-la só se /estado liberar.
        if (vigente()) for (const id of lote) pendentes.delete(id);
        processando = false;
        agendar();
      }
    }

    const removerOuvinte = conexao.adicionarOuvinteDeNotificacao((aviso) => {
      if (!vigente() || aviso.tipo !== "NOVA_MENSAGEM" || aviso.dados.atendimentoId !== atendimentoId
        || !aviso.dados.mensagemId || pendentes.size >= LIMITE_AVISOS_EM_ESPERA) return;
      pendentes.add(aviso.dados.mensagemId);
      agendar();
    });
    const removerCache = consultas.subscribe((evento) => {
      if (evento.type === "removed" && evento.query === consulta) {
        pendentes.clear();
        cancelamento.abort();
      }
    });
    document.addEventListener("visibilitychange", agendar);
    agendar();
    return () => {
      cancelamento.abort();
      clearTimeout(timer);
      removerCache();
      removerOuvinte();
      document.removeEventListener("visibilitychange", agendar);
    };
  }, [cache, chave, conexao, conectado, autorizado, ciclo, aoRecuperar, aoPerderAcesso]);
}
