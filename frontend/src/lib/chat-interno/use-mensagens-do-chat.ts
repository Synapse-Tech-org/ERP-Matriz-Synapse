import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { listarMensagensChat } from "./api";
import type { ChatMensagem, PaginaChatMensagens } from "./types";

/**
 * Chave do cache das mensagens de uma conversa interna. É a mesma de antes da paginação, e o formato
 * do dado também (`PaginaChatMensagens`): o helper de reações em tempo real (`reacoes-cache.ts`) e as
 * invalidações por prefixo `["chat-interno"]` continuam funcionando sem mudança.
 */
export const chaveMensagensDoChat = (conversaId: string) =>
  ["chat-interno", "mensagens", conversaId] as const;

function semRepetidas(mensagens: ChatMensagem[]): ChatMensagem[] {
  const vistas = new Set<string>();
  return mensagens.filter((mensagem) => {
    if (vistas.has(mensagem.id)) return false;
    vistas.add(mensagem.id);
    return true;
  });
}

/**
 * Refaz o histórico sem perder o que o usuário já carregou.
 *
 * O servidor entrega as 50 mais recentes por página. Quando chega uma mensagem nova a janela desliza, e
 * refazer só a primeira página faria a mais antiga já exibida desaparecer do topo de quem está lendo o
 * histórico. Por isso, depois da primeira página, continua buscando as anteriores até cobrir a mais
 * antiga que já estava no cache. Cada página usa o cursor da página recém-buscada, então não há buraco.
 */
async function buscarMantendoOCarregado(
  cliente: QueryClient,
  conversaId: string,
): Promise<PaginaChatMensagens> {
  const jaCarregada = cliente.getQueryData<PaginaChatMensagens>(chaveMensagensDoChat(conversaId));
  const maisAntigaJaCarregada = jaCarregada?.mensagens[0]?.enviadoEm ?? null;

  let pagina = await listarMensagensChat(conversaId);
  let mensagens = pagina.mensagens;
  let cursor = pagina.proximoCursor;
  while (maisAntigaJaCarregada && cursor && mensagens.length > 0 && mensagens[0].enviadoEm > maisAntigaJaCarregada) {
    pagina = await listarMensagensChat(conversaId, cursor);
    mensagens = [...pagina.mensagens, ...mensagens];
    cursor = pagina.proximoCursor;
  }
  return { mensagens, proximoCursor: cursor };
}

/**
 * Histórico de uma conversa interna (grupo ou direta) com paginação por cursor.
 *
 * Antes só a primeira página era buscada: quem abria um grupo movimentado nunca alcançava o que ficou
 * para trás (o servidor devolve `proximoCursor`, que a tela ignorava). `carregarMais` busca a página
 * anterior e a põe no começo da lista.
 */
export function useMensagensDoChat(conversaId: string | null) {
  const cliente = useQueryClient();
  // De qual conversa é o carregamento em andamento. Derivar `carregandoMais` daqui evita zerar estado
  // num effect ao trocar de conversa: o pedido da conversa anterior simplesmente deixa de contar.
  const [conversaCarregandoMais, setConversaCarregandoMais] = useState<string | null>(null);
  const carregandoRef = useRef<string | null>(null);
  const conversaRef = useRef(conversaId);

  useEffect(() => {
    conversaRef.current = conversaId;
  }, [conversaId]);
  const carregandoMais = conversaId !== null && conversaCarregandoMais === conversaId;

  const consulta = useQuery({
    queryKey: chaveMensagensDoChat(conversaId ?? ""),
    queryFn: () => buscarMantendoOCarregado(cliente, conversaId!),
    enabled: Boolean(conversaId),
  });

  const carregarMais = useCallback(async () => {
    if (!conversaId || carregandoRef.current === conversaId) return;
    const chave = chaveMensagensDoChat(conversaId);
    const atual = cliente.getQueryData<PaginaChatMensagens>(chave);
    if (!atual?.proximoCursor) return;

    carregandoRef.current = conversaId;
    setConversaCarregandoMais(conversaId);
    try {
      const anterior = await listarMensagensChat(conversaId, atual.proximoCursor);
      if (conversaRef.current !== conversaId) return;
      cliente.setQueryData<PaginaChatMensagens>(chave, (depois) => {
        const base = depois ?? atual;
        const mensagens = semRepetidas([...anterior.mensagens, ...base.mensagens]);
        // O cursor é o da página mais funda já buscada: a anterior, salvo se um refetch concorrente
        // já tinha ido mais longe.
        const anteriorChegouMaisLonge = mensagens[0]?.id === anterior.mensagens[0]?.id;
        return {
          mensagens,
          proximoCursor: anteriorChegouMaisLonge ? anterior.proximoCursor : base.proximoCursor,
        };
      });
    } finally {
      if (carregandoRef.current === conversaId) carregandoRef.current = null;
      setConversaCarregandoMais((atual) => (atual === conversaId ? null : atual));
    }
  }, [cliente, conversaId]);

  return {
    mensagens: consulta.data?.mensagens ?? [],
    isLoading: consulta.isLoading,
    isError: consulta.isError,
    refetch: consulta.refetch,
    temMais: Boolean(consulta.data?.proximoCursor),
    carregandoMais,
    carregarMais: () => {
      void carregarMais();
    },
  };
}
