"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarConversasChat } from "@/lib/chat-interno/api";
import { previewUltimaMensagem } from "@/lib/chat-interno/mensagem-sistema";
import { useEtapas } from "@/lib/lead/use-painel-lead";
import { LayoutDashboard, MoreHorizontal, MoreVertical, Plus, Search, SlidersHorizontal, UserPlus, UsersRound, X } from "lucide-react";
import { ListaFilaOperacional } from "./painel-operacional";
import { totalizarOperacional, useFilaOperacional, useSnapshotOperacional, type FiltroOperacional, type ConsultaFilaOperacional } from "@/lib/atendimento/painel-operacional";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CentralDeAvisos } from "@/components/notificacoes/central-de-avisos";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Seletor } from "@/components/ui/seletor";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAtendimentos,
  useContagemDeAtendimentos,
} from "@/lib/atendimento/use-atendimentos";
import { useQuantidadeAtendimentosFinalizaveis } from "@/lib/atendimento/use-transferir-finalizar";
import type { ItemInbox, VisaoAtendimento } from "@/lib/atendimento/types";
import {
  ABAS_ATENDENTE,
  ABAS_GESTAO,
  ehAbaDeAtendimento,
} from "@/lib/atendimento/types";
import { useTextos } from "@/lib/config/textos-provider";
import { useCapacidades } from "@/lib/gestao/use-capacidades";
import { useAuthStore } from "@/lib/auth/auth-store";

import { cn } from "@/lib/utils";
import type { ChatContato } from "@/lib/chat-interno/types";

import { CartaoConversa } from "./cartao-conversa";
import { JanelaFinalizacaoEmMassa } from "./finalizacao-em-massa/janela-finalizacao-em-massa";
import { DialogoSelecionarPessoa } from "@/components/chat-interno/dialogo-selecionar-pessoa";
import { DialogoCriarGrupo } from "@/components/chat-interno/dialogo-criar-grupo";

const SELECAO_TODOS = "todos";
const INTERVALO_ATUALIZACAO_ATRASO_MS = 30_000;
const JANELA_AGRUPAMENTO_BUSCA_MS = 300;

type Props = {
  selecionadoId: string | null;
  leadInicialId?: string | null;
  leadInicialGatilho?: number;
  visaoInicial?: VisaoAtendimento | null;
  visaoAtual?: VisaoAtendimento;
  onVisaoAlterada?: (visao: VisaoAtendimento) => void;
  onAtendimentosAtualizados?: (atendimentos: ItemInbox[]) => void;
  onAbrirAtendimento: (cartao: ItemInbox) => void;
  chatInternoHabilitado?: boolean;
  /** Flag `atendimentos_aba_interno`: aba "Interno" só com os chats internos (V2). */
  abaInternoHabilitada?: boolean;
  /** Flag `atendimentos_finalizados_so_no_menu`: gestor acessa Finalizados só pelo menu da lista. */
  finalizadosSoNoMenu?: boolean;
  contatosInternos?: ChatContato[];
  contatosInternosCarregando?: boolean;
  contatosInternosErro?: boolean;
  onRecarregarContatos?: () => void;
  onCriarConversaInterna?: (usuarioId: string) => Promise<unknown>;
  onCriarGrupoInterno?: (nome: string, participantes: string[]) => Promise<unknown>;
  onNovoContato?: () => void;
  className?: string;
  layoutV2?: boolean;
  painelOperacionalPermitido?: boolean;
  filtroOperacional?: FiltroOperacional | null;
  nomeFiltroOperacional?: string;
  onFiltroOperacionalAlterado?: (filtro: FiltroOperacional | null, nome?: string) => void;
  onVoltarPainel?: () => void;
  onAbrirFilaOperacional?: (id: string) => void;
};

type VisaoDeAba = Exclude<VisaoAtendimento, "FINALIZADOS">;

const ROTULO_VISAO: Record<
  VisaoDeAba,
  keyof ReturnType<typeof useTextos>["atendimentos"]["visoes"]
> = {
  ATIVOS: "ativos",
  PENDENTES: "pendentes",
  POTENCIAIS: "potenciais",
  TODOS: "todos",
};

/**
 * A lista de visões acompanha o papel da mesma sessão que a Agenda e a Sidebar usam. O servidor
 * continua sendo a autoridade final: esta lista só evita oferecer uma visão que a API recusaria.
 */
type EstadoOperacionalDaLista = {
  fila: ConsultaFilaOperacional;
  snapshot: ReturnType<typeof useSnapshotOperacional>;
  busca: string;
  setBusca: (busca: string) => void;
  etapa: string | null;
  setEtapa: (etapa: string | null) => void;
  etapas: [string, string][];
  internos: ItemInbox[];
  internosErro: boolean;
  recarregarInternos: () => void;
};

/** Conversas do chat interno no formato de cartão da lista, filtradas pela busca. */
function cartoesDasConversasInternas(
  conversas: Awaited<ReturnType<typeof listarConversasChat>> | undefined,
  busca: string,
  textos: ReturnType<typeof useTextos>["chatInterno"],
): ItemInbox[] {
  return (conversas ?? [])
    .filter((c) => (c.participantes ?? "").toLocaleLowerCase().includes(busca.toLocaleLowerCase()))
    .map((c) => ({ tipo: "EQUIPE_INTERNA", atendimentoId: null, conversaId: c.id,
      nome: c.participantes || textos.titulo, avatarUrl: c.fotoUrl ?? null,
      identificadorVisual: c.id, ultimaMensagemPreview: previewUltimaMensagem(c.ultimaMensagem, textos.sistema),
      ultimaMensagemEm: c.ultimaMensagemEm, naoLidas: c.naoLidas, participantes: c.participantes, tipoConversa: c.tipo }));
}

const ABA_INTERNOS = "INTERNOS";

type ConsultaDeInternos = Pick<ReturnType<typeof useQuery<Awaited<ReturnType<typeof listarConversasChat>>>>, "data" | "isError" | "isLoading" | "refetch">;
type PropsInternas = Props & { consultaInternos?: ConsultaDeInternos };

export function ListaConversas(props: Props) {
  return props.layoutV2 && props.chatInternoHabilitado && props.abaInternoHabilitada
    ? <ListaConversasComAbaInterna {...props} />
    : <ListaConversasRoteada {...props} />;
}

/** A consulta da aba "Interno" só existe quando a aba existe (V2 com chat interno habilitado). */
function ListaConversasComAbaInterna(props: Props) {
  const usuarioId = useAuthStore((estado) => estado.usuarioId);
  const consultaInternos = useQuery({
    queryKey: ["atendimentos", "internos-painel", usuarioId],
    queryFn: listarConversasChat,
  });
  return <ListaConversasRoteada {...props} consultaInternos={consultaInternos} />;
}

function ListaConversasRoteada(props: PropsInternas) {
  return props.painelOperacionalPermitido
    ? <ListaConversasComPainel {...props} />
    : <ListaConversasBase {...props} />;
}

/** Os hooks novos só existem quando o recurso foi efetivamente autorizado. */
function ListaConversasComPainel(props: PropsInternas) {
  const catalogo = useTextos();
  const papel = useAuthStore(s => s.papel);
  const usuarioId = useAuthStore(s => s.usuarioId);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  // Agrupamento técnico de digitação; não altera prazo/regra de atendimento.
  useEffect(() => {
    const agrupamento = window.setTimeout(() => setBuscaAplicada(busca), JANELA_AGRUPAMENTO_BUSCA_MS);
    return () => window.clearTimeout(agrupamento);
  }, [busca]);
  const [etapa, setEtapa] = useState<string | null>(null);
  const visao = props.visaoAtual ?? props.visaoInicial ?? (papel === "ATENDENTE" || papel === "OPERADOR" ? "ATIVOS" : "TODOS");
  const filtro = useMemo(() => ({ recorte: visao === "TODOS" ? "EM_ABERTO" as const : visao,
    ...props.filtroOperacional, busca: buscaAplicada, etapaId: etapa ?? undefined }),
    [props.filtroOperacional, buscaAplicada, etapa, visao]);
  const fila = useFilaOperacional(filtro, true);
  const snapshot = useSnapshotOperacional(true, filtro);
  const etapas = useEtapas();
  // O painel operacional tem consulta própria para a fila de clientes. A lista de conversas
  // internas segue a participação do usuário e aparece nos mesmos recortes TODOS/ATIVOS da inbox.
  const internos = useQuery({ queryKey: ["atendimentos", "internos-painel", usuarioId],
    queryFn: listarConversasChat, enabled: props.chatInternoHabilitado && (visao === "TODOS" || visao === "ATIVOS") && !props.filtroOperacional });
  const cartoesInternos = useMemo(
    () => cartoesDasConversasInternas(internos.data, busca, catalogo.chatInterno),
    [internos.data, busca, catalogo.chatInterno],
  );
  const digitando = busca !== buscaAplicada;
  return <ListaConversasBase {...props} operacional={{
    fila: digitando ? { ...fila, data: undefined, isLoading: true } : fila,
    snapshot: digitando ? { ...snapshot, data: undefined } : snapshot,
    busca, setBusca, etapa, setEtapa,
    etapas: (etapas.data ?? []).map(e => [e.id,e.nome]), internos: (visao === "TODOS" || visao === "ATIVOS") && !props.filtroOperacional ? cartoesInternos : [], internosErro: internos.isError && (visao === "TODOS" || visao === "ATIVOS") && !props.filtroOperacional,
    recarregarInternos: () => { void internos.refetch(); } }} />;
}

function ListaConversasBase({
  selecionadoId,
  leadInicialId,
  leadInicialGatilho = 0,
  visaoInicial,
  visaoAtual,
  onVisaoAlterada,
  onAtendimentosAtualizados,
  onAbrirAtendimento,
  chatInternoHabilitado = false,
  finalizadosSoNoMenu = false,
  contatosInternos = [],
  contatosInternosCarregando = false,
  contatosInternosErro = false,
  onRecarregarContatos,
  onCriarConversaInterna,
  onCriarGrupoInterno,
  onNovoContato,
  className,
  painelOperacionalPermitido = false,
  filtroOperacional,
  nomeFiltroOperacional,
  onFiltroOperacionalAlterado,
  onVoltarPainel,
  layoutV2,
  onAbrirFilaOperacional,
  operacional,
  consultaInternos,
}: PropsInternas & { operacional?: EstadoOperacionalDaLista }) {
  const catalogo = useTextos();
  const textos = catalogo.atendimentos;
  const papel = useAuthStore((estado) => estado.papel);
  const usuarioId = useAuthStore((estado) => estado.usuarioId);
  const acessoClientes = useCapacidades().pode("clientes.acessar");
  const papelAmplo = papel === "SUBGESTOR" || papel === "GESTOR" || papel === "ADMINISTRADOR";
  const abas = useMemo<VisaoDeAba[]>(
    () => !acessoClientes ? ["ATIVOS"] : (papelAmplo ? ABAS_GESTAO : ABAS_ATENDENTE) as VisaoDeAba[],
    [papelAmplo, acessoClientes],
  );
  const [visaoEscolhida, setVisaoEscolhida] = useState<VisaoAtendimento | null>(
    visaoInicial ?? null,
  );
  // FINALIZADOS não entra em `abas`, mas é visão válida (menu). Sem este recorte, o fallback
  // para abas[0] expulsava o usuário da lista de finalizados (E136 × PR #71).
  const visaoSolicitavel = (candidata: VisaoAtendimento | null | undefined): candidata is VisaoAtendimento =>
    candidata != null && (acessoClientes && candidata === "FINALIZADOS" || abas.includes(candidata as VisaoDeAba));
  const visao: VisaoAtendimento = visaoSolicitavel(visaoAtual)
    ? visaoAtual
    : visaoSolicitavel(visaoEscolhida)
      ? visaoEscolhida
      : abas[0];
  const abaAtiva = ehAbaDeAtendimento(visao) ? visao : "";
  const [buscaLegada, setBuscaLegada] = useState("");
  const busca = operacional?.busca ?? buscaLegada;
  const setBusca = operacional?.setBusca ?? setBuscaLegada;
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  // Aba "Interno" (V2): recorte só de tela sobre a mesma consulta do chat interno; não é uma
  // visão do backend, então não passa por escolherVisao nem altera o filtro operacional.
  const abaInternosVisivel = consultaInternos !== undefined;
  const [somenteInternos, setSomenteInternos] = useState(false);
  const mostrandoInternos = abaInternosVisivel && somenteInternos;
  const internosDaAba = useMemo(
    () => cartoesDasConversasInternas(consultaInternos?.data, busca, catalogo.chatInterno),
    [consultaInternos?.data, busca, catalogo.chatInterno],
  );

  useEffect(() => {
    if (!layoutV2) return;
    function focarBusca(evento: KeyboardEvent) {
      if (evento.defaultPrevented || evento.key !== "/" || evento.ctrlKey || evento.metaKey || evento.altKey) return;
      if (evento.target instanceof HTMLElement && evento.target.closest("input, textarea, select, [contenteditable]")) return;
      if (!buscaRef.current?.getClientRects().length || document.querySelector('[aria-modal="true"]')) return;
      evento.preventDefault();
      buscaRef.current.focus();
    }
    window.addEventListener("keydown", focarBusca);
    return () => window.removeEventListener("keydown", focarBusca);
  }, [layoutV2]);
  const [etapaLegada, setEtapaLegada] = useState<string | null>(null);
  const filtroEtapa = operacional?.etapa ?? etapaLegada;
  const setFiltroEtapa = operacional?.setEtapa ?? setEtapaLegada;
  const [filtroAtendente, setFiltroAtendente] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  const visaoPermiteFiltroAtendente =
    visao === "TODOS" || visao === "PENDENTES" || visao === "FINALIZADOS";
  const filtroAtendenteDaConsulta =
    !visaoPermiteFiltroAtendente
      ? null
      : visao === "FINALIZADOS"
      ? papelAmplo
        ? filtroAtendente === SELECAO_TODOS
          ? null
          : filtroAtendente
        : usuarioId
      : filtroAtendente === SELECAO_TODOS
        ? null
        : filtroAtendente;
  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    atendentesConhecidos = [],
  } = useAtendimentos(visao, filtroAtendenteDaConsulta, !painelOperacionalPermitido || Boolean(leadInicialId));
  const snapshotOperacional = operacional?.snapshot;
  const totaisOperacionais = totalizarOperacional(snapshotOperacional?.data?.equipe ?? []);
  const contagensOperacionais: Record<VisaoAtendimento, number> = {
    TODOS: totaisOperacionais.emAberto, ATIVOS: totaisOperacionais.ativos,
    PENDENTES: totaisOperacionais.pendentes, POTENCIAIS: totaisOperacionais.potenciais,
    FINALIZADOS: totaisOperacionais.finalizados,
  };
  const cartoes = useMemo(() => (data ?? []).filter((item): item is ItemInbox => item != null), [data]);
  const { data: contagens } = useContagemDeAtendimentos(!painelOperacionalPermitido);
  const abriuLeadInicial = useRef(false);
  const [novaInternaAberta, setNovaInternaAberta] = useState(false);
  const [novoGrupoAberto, setNovoGrupoAberto] = useState(false);
  const [finalizacaoEmMassaAberta, setFinalizacaoEmMassaAberta] = useState(false);
  const podeFinalizarEmLote = useCapacidades().pode("atendimentos.finalizar_lote");
  const quantidadeFinalizavel = useQuantidadeAtendimentosFinalizaveis(podeFinalizarEmLote);

  const fimDaLista = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (painelOperacionalPermitido) return;
    const relogio = window.setInterval(() => setAgora(new Date()), INTERVALO_ATUALIZACAO_ATRASO_MS);
    return () => window.clearInterval(relogio);
  }, [painelOperacionalPermitido]);

  useEffect(() => {
    const alvo = fimDaLista.current;
    if (operacional || !alvo || !hasNextPage) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "240px" },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, operacional]);

  useEffect(() => {
    onVisaoAlterada?.(visao);
  }, [onVisaoAlterada, visao]);

  useEffect(() => {
    onAtendimentosAtualizados?.(cartoes);
  }, [cartoes, onAtendimentosAtualizados]);

  useEffect(() => {
    abriuLeadInicial.current = false;
  }, [leadInicialGatilho, leadInicialId]);

  useEffect(() => {
    if (!leadInicialId || abriuLeadInicial.current) return;
    const cartao = cartoes.find((item) => item.tipo !== "EQUIPE_INTERNA" && item.leadId === leadInicialId);
    if (cartao) {
      abriuLeadInicial.current = true;
      onAbrirAtendimento(cartao);
    }
  }, [cartoes, leadInicialGatilho, leadInicialId, onAbrirAtendimento]);

  function escolherVisao(proxima: VisaoAtendimento) {
    if (painelOperacionalPermitido) {
      onFiltroOperacionalAlterado?.({ ...filtroOperacional, recorte: proxima === "TODOS" ? "EM_ABERTO" : proxima,
        ...(proxima === "FINALIZADOS" ? { sinal: "TODOS" as const } : {}) });
    }
    setVisaoEscolhida(proxima);
    onVisaoAlterada?.(proxima);
  }

  const etapas = useMemo(() => {
    if (operacional) return operacional.etapas;
    const mapa = new Map<string, string>();
    for (const cartao of cartoes) {
      if (cartao.tipo !== "EQUIPE_INTERNA" && cartao.etapaId && cartao.etapaNome) {
        mapa.set(cartao.etapaId, cartao.etapaNome);
      }
    }
    return Array.from(mapa.entries());
  }, [cartoes, operacional]);

  const atendentes = useMemo(() => {
    if (operacional) return operacional.snapshot.data?.equipe
      .filter(l => l.atendenteId && l.nome).map(l => [l.atendenteId!,l.nome!] as [string,string]) ?? [];
    const mapa = new Map(atendentesConhecidos);
    for (const cartao of cartoes) {
      if (cartao.tipo !== "EQUIPE_INTERNA" && cartao.atendenteId && cartao.atendenteNome) {
        mapa.set(cartao.atendenteId, cartao.atendenteNome);
      }
    }
    return Array.from(mapa.entries());
  }, [atendentesConhecidos, cartoes, operacional]);

  const opcoesDeAtendente = useMemo(() => {
    if (visao !== "FINALIZADOS" || papelAmplo) return atendentes;
    const proprio = atendentes.find(([id]) => id === usuarioId);
    return proprio ? [proprio] : usuarioId ? [[usuarioId, textos.filtros.atendente]] : [];
  }, [atendentes, papelAmplo, textos.filtros.atendente, usuarioId, visao]);

  const filtroAtendenteVisivel =
    papelAmplo
      ? filtroAtendente ?? SELECAO_TODOS
      : visao === "FINALIZADOS"
        ? filtroAtendenteDaConsulta ?? ""
        : filtroAtendente ?? "";
  const temFiltroDeAtendente =
    visaoPermiteFiltroAtendente &&
    (visao === "FINALIZADOS"
      ? papelAmplo || opcoesDeAtendente.length > 0
      : papelAmplo || opcoesDeAtendente.length > 1);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return cartoes.filter((cartao) => {
      const correspondeABusca =
        !termo ||
        [cartao.tipo === "EQUIPE_INTERNA" ? cartao.nome : cartao.leadNome,
          cartao.tipo === "EQUIPE_INTERNA" ? cartao.conversaId : cartao.leadEmpresa,
          cartao.tipo === "EQUIPE_INTERNA" ? cartao.participantes : cartao.atendimentoId].some(
          (valor) => valor?.toLocaleLowerCase("pt-BR").includes(termo),
        );
      return (
        correspondeABusca &&
        (cartao.tipo === "EQUIPE_INTERNA" || !filtroEtapa || cartao.etapaId === filtroEtapa) &&
        (cartao.tipo === "EQUIPE_INTERNA"
          || !filtroAtendenteDaConsulta
          || cartao.atendenteId === filtroAtendenteDaConsulta)
      );
    });
  }, [busca, cartoes, filtroAtendenteDaConsulta, filtroEtapa]);
  const indicePrimeiroFinalizado = visao === "TODOS"
    ? filtrados.findIndex(
        (cartao) =>
          cartao.tipo !== "EQUIPE_INTERNA"
          && (cartao.atendimentoAtivoId === null
            || (cartao.atendimentoAtivoId === undefined && cartao.status === "FINALIZADO")),
      )
    : -1;

  const botaoFiltros = (
    <Button type="button" variant="outline" size="icon-sm" className="min-h-10 min-w-10"
      aria-label={textos.lista.filtros} aria-expanded={filtrosAbertos}
      disabled={etapas.length === 0 && !temFiltroDeAtendente} onClick={() => setFiltrosAbertos((abertos) => !abertos)}>
      <SlidersHorizontal className="size-(--tamanho-icone-interface)" aria-hidden />
    </Button>
  );
  const botaoNovoContato = onNovoContato && (
    <Button type="button" data-slot="novo-atendimento" variant="outline" size="icon-sm" className="min-h-10 min-w-10"
      aria-label={textos.novoContato.botao} onClick={onNovoContato}>
      {layoutV2
        ? <Plus className="size-(--tamanho-icone-interface)" aria-hidden />
        : <UserPlus className="size-(--tamanho-icone-interface)" aria-hidden />}
    </Button>
  );

  // V2: a Visão geral do gestor tem botão próprio (azul, como o "+"); o título sai da tela.
  const botaoVisaoGeral = layoutV2 && onVoltarPainel && (
    <Button type="button" data-slot="lista-visao-geral" variant="outline" size="icon-sm" className="min-h-10 min-w-10"
      aria-label={catalogo.painelOperacional.voltar} title={catalogo.painelOperacional.titulo} onClick={onVoltarPainel}>
      <LayoutDashboard className="size-(--tamanho-icone-interface)" aria-hidden />
    </Button>
  );

  const menuDaLista = (!layoutV2 || !painelOperacionalPermitido || podeFinalizarEmLote || finalizadosSoNoMenu) && (
    <DropdownMenu>
              <DropdownMenuTrigger
                data-slot="lista-conversas-menu"
                className="inline-flex size-10 items-center justify-center rounded-[var(--raio-botao-md)] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={textos.finalizar.todosMenu}
              >
                {layoutV2
                  ? <MoreVertical className="size-(--tamanho-icone-interface)" aria-hidden />
                  : <MoreHorizontal className="size-(--tamanho-icone-interface)" aria-hidden />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Ponto futuro de Registrar venda: este menu e o ciclo explicitamente selecionado.
                    Mantido sem item/atalho enquanto a acao manual estiver globalmente oculta. */}
                <DropdownMenuItem onClick={() => escolherVisao("FINALIZADOS")}>
                  {textos.lista.finalizados}
                </DropdownMenuItem>
                {podeFinalizarEmLote && (
                  <DropdownMenuItem
                    onClick={() => setFinalizacaoEmMassaAberta(true)}
                    disabled={
                      quantidadeFinalizavel.isLoading ||
                      quantidadeFinalizavel.data?.quantidade === 0
                    }
                  >
                    {textos.finalizar.todos}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
  );

  return (
    <div data-slot="lista-conversas" className={cn("flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-background", painelOperacionalPermitido && "bg-card", className)}>
      <div data-slot="lista-conversas-cabecalho" className="px-4 pt-4">
        <div data-slot="lista-conversas-titulo" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {layoutV2 ? <h1 className="sr-only">{catalogo.menu.itens.atendimentos}</h1>
            : <h1 className={cn("min-w-0 break-words text-lg font-bold tracking-tight text-foreground", painelOperacionalPermitido && "text-sm text-primary")}>{onVoltarPainel
            ? <button type="button" onClick={onVoltarPainel} className="rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={catalogo.painelOperacional.voltar}>{catalogo.menu.itens.atendimentos}</button>
            : catalogo.menu.itens.atendimentos}</h1>}
          <div data-slot="lista-conversas-acoes" className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1">
            {layoutV2 && menuDaLista}
            {layoutV2 && <CentralDeAvisos mostrarContagem />}
            {layoutV2 && botaoFiltros}
            {!layoutV2 && menuDaLista}
            {!layoutV2 && botaoNovoContato}
            {chatInternoHabilitado && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--raio-botao-md)] border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Opções de chat interno"
                  title="Chat interno"
                >
                  <UsersRound className="size-(--tamanho-icone-interface)" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setNovaInternaAberta(true);
                      onRecarregarContatos?.();
                    }}
                  >
                    {catalogo.chatInterno.novaConversa}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setNovoGrupoAberto(true);
                      onRecarregarContatos?.();
                    }}
                  >
                    Criar grupo interno
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {botaoVisaoGeral}
            {layoutV2 ? botaoNovoContato : botaoFiltros}
          </div>
        </div>
        <div data-slot="lista-conversas-busca" className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-(--tamanho-icone-interface) -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={buscaRef}
            aria-keyshortcuts={layoutV2 ? "/" : undefined}
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder={textos.lista.busca}
            className="h-10 rounded-xl bg-muted/60 pl-9"
          />
          {layoutV2 && <kbd aria-hidden="true">/</kbd>}
        </div>
        {filtroOperacional && <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
          {filtroOperacional.recorte && filtroOperacional.recorte !== "EM_ABERTO" && <button type="button" className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-primary" aria-label={catalogo.painelOperacional.remover.replace("{filtro}", ({ NOVAS: catalogo.painelOperacional.novas, ATIVOS: catalogo.painelOperacional.ativos, PENDENTES: catalogo.painelOperacional.pendentes, POTENCIAIS: catalogo.painelOperacional.potenciais, SEM_RESPOSTA: catalogo.painelOperacional.comAtraso, FINALIZADOS: catalogo.painelOperacional.finalizados })[filtroOperacional.recorte])} onClick={() => onFiltroOperacionalAlterado?.({ ...filtroOperacional, recorte: "EM_ABERTO" })}>{({ NOVAS: catalogo.painelOperacional.novas, ATIVOS: catalogo.painelOperacional.ativos, PENDENTES: catalogo.painelOperacional.pendentes, POTENCIAIS: catalogo.painelOperacional.potenciais, SEM_RESPOSTA: catalogo.painelOperacional.comAtraso, FINALIZADOS: catalogo.painelOperacional.finalizados })[filtroOperacional.recorte]}<X className="size-3" aria-hidden /></button>}
          {(filtroOperacional.atendenteId || filtroOperacional.entrada) && <button type="button" className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-primary" aria-label={catalogo.painelOperacional.remover.replace("{filtro}", nomeFiltroOperacional ?? catalogo.painelOperacional.entrada)} onClick={() => onFiltroOperacionalAlterado?.({ ...filtroOperacional, atendenteId: undefined, entrada: undefined })}>{nomeFiltroOperacional ?? catalogo.painelOperacional.entrada}<X className="size-3" aria-hidden /></button>}
          {filtroOperacional.sinal && filtroOperacional.sinal !== "TODOS" && <button type="button" className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-primary" onClick={() => onFiltroOperacionalAlterado?.({ ...filtroOperacional, sinal: "TODOS" })} aria-label={catalogo.painelOperacional.remover.replace("{filtro}", filtroOperacional.sinal === "NOVAS" ? catalogo.painelOperacional.novas : catalogo.painelOperacional.comAtraso)}>{filtroOperacional.sinal === "NOVAS" ? catalogo.painelOperacional.novas : catalogo.painelOperacional.comAtraso}<X className="size-3" aria-hidden /></button>}
          {layoutV2 && (etapas.length > 0 || temFiltroDeAtendente) && (
            <button
              type="button"
              aria-label={textos.lista.adicionarFiltro}
              title={textos.lista.adicionarFiltro}
              aria-expanded={filtrosAbertos}
              onClick={() => setFiltrosAbertos((abertos) => !abertos)}
              className="grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-primary/30 bg-card text-primary hover:border-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          )}
          <button type="button" className="px-2 py-1 underline underline-offset-2" onClick={() => onFiltroOperacionalAlterado?.(null)}>{catalogo.painelOperacional.limpar}</button>
        </div>}
      </div>

      <Tabs
        value={mostrandoInternos ? ABA_INTERNOS : filtroOperacional ? filtroOperacional.recorte === "EM_ABERTO" ? "TODOS" : filtroOperacional.recorte : abaAtiva}
        onValueChange={(valor) => {
          setSomenteInternos(valor === ABA_INTERNOS);
          if (valor !== ABA_INTERNOS) escolherVisao(valor as VisaoAtendimento);
        }}
      >
        <TabsList
          data-slot="abas-conversas"
          data-com-internos={abaInternosVisivel || undefined}
          variant="line"
          className={cn(
            "mx-4 mt-3 flex h-auto w-[calc(100%-2rem)] justify-start gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-0 md:grid md:gap-1 md:overflow-x-hidden",
            painelOperacionalPermitido ? (finalizadosSoNoMenu ? "grid-cols-4" : "grid-cols-5") + " gap-0 overflow-x-hidden group-data-horizontal/tabs:h-auto" : papelAmplo ? "md:grid-cols-4" : "md:grid-cols-3",
          )}
        >
          {(painelOperacionalPermitido ? finalizadosSoNoMenu ? ABAS_GESTAO : [...ABAS_GESTAO, "FINALIZADOS" as const] : abas).map((item) => (
            <TabsTrigger
              key={item}
              value={item}
              className={cn("min-w-0 shrink-0 gap-1 rounded-full border border-border px-3 py-1.5 text-[0.75rem] shadow-none after:hidden data-active:border-primary data-active:bg-primary data-active:text-primary-foreground md:rounded-none md:border-0 md:px-0.5 md:pt-1 md:pb-2.5 md:text-[0.6875rem] md:data-active:bg-transparent md:data-active:text-foreground md:data-active:after:bg-primary md:after:opacity-0 md:data-active:after:opacity-100", painelOperacionalPermitido && "h-auto min-h-14 flex-col-reverse rounded-none border-0 px-0 text-[0.625rem] data-active:bg-transparent data-active:text-primary after:block group-data-horizontal/tabs:after:bottom-0 after:bg-primary")}
            >
              {item === "FINALIZADOS" ? catalogo.painelOperacional.finalizadosAba : textos.visoes[ROTULO_VISAO[item as VisaoDeAba]]}
              {(painelOperacionalPermitido || contagens) && (
                <Badge
                  variant={item === visao ? "default" : "secondary"}
                  className={cn("shrink-0 px-1 text-[0.625rem] data-active:bg-primary-foreground/20", painelOperacionalPermitido && "bg-transparent px-0 text-sm font-bold", painelOperacionalPermitido && (item === (filtroOperacional ? filtroOperacional.recorte === "EM_ABERTO" ? "TODOS" : filtroOperacional.recorte : abaAtiva) ? "text-primary" : "text-muted-foreground"))}
                >
                  {painelOperacionalPermitido ? snapshotOperacional?.data ? contagensOperacionais[item] : "—" : contagens?.[item]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
          {abaInternosVisivel && (
            <TabsTrigger
              value={ABA_INTERNOS}
              className={cn("min-w-0 shrink-0 gap-1 rounded-full border border-border px-3 py-1.5 text-[0.75rem] shadow-none after:hidden", painelOperacionalPermitido && "h-auto min-h-14 flex-col-reverse rounded-none border-0 px-0 text-[0.625rem]")}
            >
              {textos.visoes.internos}
              <Badge variant={mostrandoInternos ? "default" : "secondary"} className="shrink-0 px-1 text-[0.625rem]">
                {consultaInternos?.data ? consultaInternos.data.length : "—"}
              </Badge>
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {filtrosAbertos && (etapas.length > 0 || temFiltroDeAtendente) && (
        <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2 text-xs">
          {etapas.length > 0 && (
            <Seletor
              className="min-w-28"
              valor={filtroEtapa ?? ""}
              placeholder={textos.filtros.etapa}
              ariaLabel={textos.filtros.etapa}
              opcoes={etapas.map(([id, nome]) => ({ valor: id, rotulo: nome }))}
              onChange={(valor) => setFiltroEtapa(valor || null)}
            />
          )}
          {temFiltroDeAtendente && (
            <Seletor
              className="min-w-28"
              valor={operacional ? filtroOperacional?.atendenteId ?? (papelAmplo ? SELECAO_TODOS : usuarioId ?? "") : filtroAtendenteVisivel}
              placeholder={textos.filtros.atendente}
              ariaLabel={textos.filtros.atendente}
              opcoes={(papelAmplo
                ? [[SELECAO_TODOS, textos.visoes.todos] as [string, string], ...opcoesDeAtendente]
                : opcoesDeAtendente).map(([id, nome]) => ({
                valor: id,
                rotulo: nome,
              }))}
              onChange={(valor) => {
                setFiltroAtendente(valor || null);
                if (operacional) onFiltroOperacionalAlterado?.({ ...filtroOperacional,
                  recorte: filtroOperacional?.recorte ?? (visao === "TODOS" ? "EM_ABERTO" : visao),
                  atendenteId: valor === SELECAO_TODOS ? undefined : valor || undefined, entrada: false },
                  atendentes.find(([id]) => id === valor)?.[1]);
              }}
            />
          )}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1 overflow-hidden" data-slot="lista-conversas-scroll">
        <div className="pt-4" data-slot="lista-conversas-itens">
          {mostrandoInternos ? (
            consultaInternos?.isError ? (
              <div role="alert" className="p-3 text-xs">
                <p>{catalogo.painelOperacional.erroInternos}</p>
                <Button variant="ghost" onClick={() => void consultaInternos?.refetch()}>{catalogo.painelOperacional.tentar}</Button>
              </div>
            ) : consultaInternos?.isLoading ? (
              <div className="space-y-2 p-3"><Skeleton className="h-14 w-full" /></div>
            ) : internosDaAba.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">{textos.cartao.vazio}</p>
            ) : (
              <ul>
                {internosDaAba.map((cartao) => cartao.tipo === "EQUIPE_INTERNA" && (
                  <li key={cartao.conversaId}>
                    <CartaoConversa cartao={cartao} selecionado={cartao.conversaId === selecionadoId} onAbrirAtendimento={() => onAbrirAtendimento(cartao)} />
                  </li>
                ))}
              </ul>
            )
          ) : operacional ? <>
            <ListaFilaOperacional compacta={layoutV2} consulta={operacional.fila} referencia={operacional.snapshot.data} selecionadoId={selecionadoId} onAbrir={onAbrirFilaOperacional ?? (() => undefined)} internos={operacional.internos} onAbrirInterno={onAbrirAtendimento} />
            {operacional.internosErro && <div role="alert" className="p-3 text-xs"><p>{catalogo.painelOperacional.erroInternos}</p><Button variant="ghost" onClick={operacional.recarregarInternos}>{catalogo.painelOperacional.tentar}</Button></div>}
          </> : isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, indice) => (
                <Skeleton key={indice} className="h-14 w-full" />
              ))}
            </div>
          ) : filtrados.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {textos.cartao.vazio}
            </p>
          ) : (
            filtrados.map((cartao, indice) => (
              <Fragment
                key={cartao.tipo === "EQUIPE_INTERNA" ? `equipe-${cartao.conversaId}` : `cliente-${cartao.leadId}`}
              >
                {indice === indicePrimeiroFinalizado && (
                  <div
                    className="mx-4 mb-1 mt-4 flex items-center gap-3 text-xs font-semibold text-muted-foreground"
                    role="separator"
                    aria-label={textos.lista.finalizados}
                  >
                    <span>{textos.lista.finalizados}</span>
                    <span className="h-px flex-1 bg-border" aria-hidden />
                  </div>
                )}
                <CartaoConversa
                  cartao={cartao}
                  agora={agora}
                  selecionado={cartao.tipo === "EQUIPE_INTERNA" ? cartao.conversaId === selecionadoId : cartao.leadId === selecionadoId}
                  onAbrirAtendimento={() => onAbrirAtendimento(cartao)}
                />
              </Fragment>
            ))
          )}
          {!operacional && hasNextPage && (
            <div ref={fimDaLista} className="p-3 text-center text-xs text-muted-foreground" aria-live="polite">
              {isFetchingNextPage ? textos.lista.carregandoMais : textos.lista.carregarMais}
            </div>
          )}
        </div>
      </ScrollArea>

      {chatInternoHabilitado && (
        <>
          <DialogoSelecionarPessoa
            aberto={novaInternaAberta}
            onFechar={() => setNovaInternaAberta(false)}
            contatos={contatosInternos}
            carregando={contatosInternosCarregando}
            erro={contatosInternosErro}
            onTentarNovamente={onRecarregarContatos}
            onSelecionar={(usuarioId) => onCriarConversaInterna?.(usuarioId) ?? Promise.resolve()}
            textos={catalogo.chatInterno}
          />
          <DialogoCriarGrupo
            aberto={novoGrupoAberto}
            onFechar={() => setNovoGrupoAberto(false)}
            contatos={contatosInternos ?? []}
            onCriar={async (nome, participantes) => {
              if (onCriarGrupoInterno) {
                await onCriarGrupoInterno(nome, participantes);
              }
            }}
            textos={catalogo.chatInterno}
          />
        </>
      )}

      <JanelaFinalizacaoEmMassa
        aberta={finalizacaoEmMassaAberta && podeFinalizarEmLote}
        onFechar={() => setFinalizacaoEmMassaAberta(false)}
      />
    </div>
  );
}
