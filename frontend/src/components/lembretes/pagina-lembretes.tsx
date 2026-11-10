"use client";

import Link from "next/link";
import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import listaV2 from "@/components/shell/lista-v2.module.css";
import visual from "@/components/shell/agenda-recursos-v2.module.css";
import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";


import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Bot, Check, CheckCheck, ChevronDown, Clock3, Plus, Search, Trash2 } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { PillDeStatus } from "@/components/ui/pill-de-status";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Seletor } from "@/components/ui/seletor";
import { SeletorData } from "@/components/ui/seletor-data";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useTextos } from "@/lib/config/textos-provider";
import { useEquipe } from "@/lib/equipe/use-equipe";
import { chaveDoDiaLocal, horaLocal, horariosDeAdiamento, periodoLocal } from "@/lib/suporte/agenda-de-datas";
import { atualizarLembrete, editarLembrete, listarLembretes, removerLembrete } from "@/lib/suporte/api";
import type { Lembrete, StatusLembrete } from "@/lib/suporte/types";

import { useCapacidades } from "@/lib/gestao/use-capacidades";

import { FormularioLembrete } from "./formulario-lembrete";

export function PaginaLembretes() {
  const layoutV2 = useFuncionalidadesHabilitadas().data?.includes("recursos_layout_v2") ?? false;
  const { lembretes: textos, menu } = useTextos();
  const papel = useAuthStore((s) => s.papel);
  // Só apresentação: coluna de atendente para quem enxerga os lembretes da equipe.
  const gestor = ["SUBGESTOR", "GESTOR", "ADMINISTRADOR"].includes(papel ?? "");
  const capacidades = useCapacidades();
  const podeAbrirConversa = capacidades.pode("atendimentos.ver");
  const podeCriar = capacidades.pode("lembretes.criar");
  const podeEditarExcluir = capacidades.pode("lembretes.editar_excluir");
  const podeFiltrarEquipe = layoutV2 && gestor && capacidades.pode("equipe.ver");
  const equipe = useEquipe(podeFiltrarEquipe);
  const cache = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [status, setStatus] = useState<StatusLembrete | "">("");
  const [pagina, setPagina] = useState(0);
  const [edicao, setEdicao] = useState<Lembrete | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [atendente, setAtendente] = useState("");
  const [automaticos, setAutomaticos] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const periodoValido = !inicio || !fim || inicio <= fim;
  const atendenteId = podeFiltrarEquipe ? atendente || undefined : undefined;

  useEffect(() => {
    if (!layoutV2) return;
    const intervalo = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(intervalo);
  }, [layoutV2]);

  useEffect(() => {
    if (!layoutV2 || busca.trim() === buscaAplicada) return;
    const timer = window.setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setPagina(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [layoutV2, busca, buscaAplicada]);

  const consulta = useQuery({
    queryKey: ["lembretes", inicio, fim, status, pagina, layoutV2, atendenteId, buscaAplicada, automaticos],
    enabled: periodoValido,
    queryFn: () =>
      listarLembretes({
        ...periodoLocal(inicio, fim),
        status: status || undefined,
        atendenteId,
        busca: layoutV2 ? buscaAplicada || undefined : undefined,
        origemAutomatica: layoutV2 && automaticos ? true : undefined,
        incluirResumo: layoutV2,
        pagina,
      }),
  });
  const atualizar = useMutation({
    mutationFn: ({ item, novo }: { item: Lembrete; novo: StatusLembrete }) =>
      atualizarLembrete(item, novo),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["lembretes"] }),
  });
  const adiar = useMutation({
    mutationFn: ({ item, data }: { item: Lembrete; data: Date }) => editarLembrete(item.id, {
      texto: item.texto, status: item.status, dataHora: data.toISOString(),
    }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["lembretes"] }),
  });
  const remover = useMutation({
    mutationFn: removerLembrete,
    onSuccess: () => cache.invalidateQueries({ queryKey: ["lembretes"] }),
  });

  function mudarFiltro(atualizar: () => void) {
    atualizar();
    setPagina(0);
  }

  const resumo = periodoValido ? consulta.data?.resumo : undefined;
  return (
    <div data-layout={layoutV2 ? "v2" : "legado"} className={layoutV2 ? `${listaV2.pagina} ${listaV2.modulo} ${visual.paleta}` : "space-y-5 p-6"}>
      {layoutV2 && <CabecalhoListaV2 titulo={textos.titulo} grupo={menu?.grupoRecursos} busca={textos.v2.buscaContatos} />}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{textos.titulo}</h1>
          <p className="text-sm text-muted-foreground">{layoutV2 ? textos.v2.descricao : textos.descricao}</p>
        </div>
        {podeCriar && <Button data-slot={layoutV2 ? "lista-v2-acao" : "button"} onClick={() => setAberto(true)}>
          {layoutV2 && <Plus aria-hidden />}{textos.novo}
        </Button>}
      </header>

      <div className={layoutV2 ? visual.grade : undefined}>
      <div className={layoutV2 ? visual.lista : "space-y-4"}>
      <div className={layoutV2 ? visual.barra : "flex flex-wrap items-end gap-3 rounded-lg border p-3"}>
        {layoutV2 && <>
          <div className={visual.busca}>
            <Search aria-hidden className="size-4 shrink-0" />
            <Input aria-label={textos.v2.buscar} placeholder={textos.v2.buscar} maxLength={150}
              value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {podeFiltrarEquipe && Boolean(equipe.data?.length) && <Seletor
            ariaLabel={textos.colunas.atendente} placeholder={textos.v2.todosAtendentes} className="w-auto max-w-full"
            valor={atendente} opcoes={(equipe.data ?? []).map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
            onChange={(valor) => mudarFiltro(() => setAtendente(valor))} />}
          <Button variant={automaticos ? "default" : "outline"} aria-pressed={automaticos}
            onClick={() => mudarFiltro(() => setAutomaticos(!automaticos))}>
            <Bot aria-hidden />{textos.v2.soAutomaticos}
          </Button>
        </>}
        {!layoutV2 && <>
        <label className="text-sm">
          {textos.filtros.inicio}
          <SeletorData
            valor={inicio}
            placeholder={textos.filtros.inicio}
            onChange={(valor) => mudarFiltro(() => setInicio(valor))}
          />
        </label>
        <label className="text-sm">
          {textos.filtros.fim}
          <SeletorData
            valor={fim}
            placeholder={textos.filtros.fim}
            onChange={(valor) => mudarFiltro(() => setFim(valor))}
          />
        </label>
        </>}
        {layoutV2 && resumo && <span className={visual.pendentes}><strong>{resumo.pendentes}</strong> {textos.v2.pendentes}</span>}
        {!layoutV2 && <label className="text-sm">
          {textos.filtros.status}
          <Seletor
            className="ml-2"
            valor={status}
            placeholder={textos.filtros.todos}
            opcoes={[
              { valor: "PENDENTE", rotulo: textos.status.pendente },
              { valor: "CONCLUIDO", rotulo: textos.status.concluido },
            ]}
            onChange={(valor) => mudarFiltro(() => setStatus(valor as StatusLembrete | ""))}
          />
        </label>}
      </div>

      {(atualizar.isError || adiar.isError || remover.isError) &&
        <p role="alert" className="text-sm text-destructive">{textos.formulario.erroOperacao}</p>}
      {!periodoValido ? <p role="status">{textos.v2?.periodoInvalido ?? textos.vazio}</p> : consulta.isLoading ? (
        <p>{textos.carregando}</p>
      ) : consulta.isError ? (
        <ErroDeCarregamento
          mensagem={textos.erro}
          onTentarNovamente={() => consulta.refetch()}
        />
      ) : !consulta.data?.lembretes.length ? (
        layoutV2 ? <div className={visual.vazio}>
          <span className={visual.vazioIcone}><CheckCheck aria-hidden className="size-6" /></span>
          <strong>{textos.v2.vazioTitulo}</strong><span>{textos.v2.vazioDescricao}</span>
        </div> : <p className="text-muted-foreground">{textos.vazio}</p>
      ) : (
        <TabelaDeLembretes
          itens={consulta.data.lembretes}
          mostrarAtendente={layoutV2 || gestor}
          podeAbrirConversa={podeAbrirConversa}
          textos={textos}
          agora={layoutV2 ? agora : undefined}
          ocupado={atualizar.isPending || adiar.isPending || remover.isPending}
          onConcluir={podeEditarExcluir ? (item) => atualizar.mutate({
            item, novo: item.status === "CONCLUIDO" ? "PENDENTE" : "CONCLUIDO",
          }) : undefined}
          onAdiar={layoutV2 && podeEditarExcluir ? (item, data) => adiar.mutate({ item, data }) : undefined}
          onEditar={layoutV2 && podeEditarExcluir ? setEdicao : undefined}
          onRemover={podeEditarExcluir ? (id) => remover.mutate(id) : undefined}
        />
      )}

      {(!layoutV2 || pagina > 0 || consulta.data?.temMais) && <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
          {textos.paginacao.anterior}
        </Button>
        <Button
          variant="outline"
          disabled={!consulta.data?.temMais}
          onClick={() => setPagina((p) => p + 1)}
        >
          {textos.paginacao.proxima}
        </Button>
      </div>}

      </div>
      {layoutV2 && <aside className={visual.lateral}>
        {resumo && <section className={visual.painel}>
          <h2>{textos.v2.resumo}</h2>
          <dl>
            {([["hoje", textos.v2.paraHoje, resumo.hoje], ["semana", textos.v2.ateDomingo, resumo.semana],
              ["automaticos", textos.v2.automaticosPendentes, resumo.automaticos]] as const).map(([tom, rotulo, total]) => (
              <div key={tom}>
                <span aria-hidden className={visual.ponto} data-tom={tom} />
                <dt>{rotulo}</dt><dd>{total}</dd>
              </div>
            ))}
          </dl>
        </section>}
        <section className={visual.aviso}>
          <h2><Bot aria-hidden className="size-4" />{textos.v2.tituloAutomaticos}</h2>
          <p>{textos.v2.descricaoAutomaticos}</p>
        </section>
      </aside>}
      </div>
      <FormularioLembrete visualV2={layoutV2} aberto={aberto && podeCriar} onFechar={() => setAberto(false)} />
      {edicao && podeEditarExcluir && <FormularioLembrete key={edicao.id} visualV2={layoutV2} aberto existente={edicao}
        onFechar={() => setEdicao(null)} />}
    </div>
  );
}

type TextosLembretes = ReturnType<typeof useTextos>["lembretes"];

function TabelaDeLembretes({
  itens,
  mostrarAtendente,
  podeAbrirConversa,
  textos,
  onConcluir,
  onRemover,
  onAdiar,
  onEditar,
  agora,
  ocupado,
}: {
  itens: Lembrete[];
  mostrarAtendente: boolean;
  podeAbrirConversa: boolean;
  textos: TextosLembretes;
  onConcluir?: (item: Lembrete) => void;
  onRemover?: (id: string) => void;
  onAdiar?: (item: Lembrete, data: Date) => void;
  onEditar?: (item: Lembrete) => void;
  agora?: number;
  ocupado: boolean;
}) {
  const [concluidosAbertos, setConcluidosAbertos] = useState(false);
  const grupos = agora === undefined ? [{ id: "lista", itens, rotulo: null }] : agruparLembretes(itens, agora, textos);
  return (
    <div className={agora === undefined ? undefined : visual.lista}>
      {grupos.map((grupo) => {
        const recolhivel = grupo.id === "concluidos";
        const aberto = !recolhivel || concluidosAbertos;
        const cabecalho = <><i aria-hidden className={visual.ponto} data-tom={grupo.id === "amanha" ? "semana" : grupo.id} />
          {grupo.rotulo}<small aria-hidden className={visual.quantidade}>{grupo.itens.length}</small></>;
        return <div key={grupo.id} className={agora === undefined ? "overflow-x-auto rounded-lg border border-border bg-card" : visual.cartao}>
      <table className={"w-full text-sm " + (agora === undefined ? "" : visual.lembretesTabela)}>
        {agora === undefined && <thead className="bg-muted/60">
          <tr>
            <th className="w-10 px-4 py-3" />
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.texto}
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.lead}
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.dataHora}
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.status}
            </th>
            {mostrarAtendente && (
              <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                {textos.colunas.atendente}
              </th>
            )}
            <th className="px-4 py-3 text-right text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.acoes}
            </th>
          </tr>
        </thead>}
        <tbody>
          {grupo.rotulo && <tr>
            <th scope="rowgroup" colSpan={mostrarAtendente ? 6 : 5} className={visual.grupo + " text-left"}>
              {recolhivel ? <button type="button" className={visual.grupoControle} aria-expanded={aberto}
                onClick={() => setConcluidosAbertos(!aberto)}>{cabecalho}<ChevronDown aria-hidden className="size-4" /></button>
                : <span>{cabecalho}{grupo.id === "hoje" && agora !== undefined && <small aria-hidden className={visual.total}>
                  {new Date(agora).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</small>}</span>}
            </th>
          </tr>}
          {aberto && grupo.itens.map((item) => {
            const concluido = item.status === "CONCLUIDO";
            const atrasado = agora !== undefined && !concluido && Date.parse(item.dataHora) < agora;
            return (
              <tr key={item.id} data-concluido={concluido} data-atrasado={atrasado} className="border-t border-border">
                <td className="px-4 py-3">
                  {onConcluir ? (
                    <button
                      type="button"
                      aria-label={concluido && agora !== undefined ? textos.v2.reabrir : textos.concluir}
                      disabled={ocupado || (concluido && agora === undefined)}
                      onClick={() => onConcluir(item)}
                      className={`${agora === undefined ? "" : visual.marca} flex size-6 items-center justify-center rounded-full border-2 ${
                        concluido ? "border-cor-sucesso bg-cor-sucesso" : "border-muted-foreground/40"
                      }`}
                    >
                      {concluido && <Check className="size-[calc(var(--tamanho-icone-interface)*0.875)] text-white" />}
                    </button>
                  ) : (
                    <span
                      aria-hidden
                      className={`${agora === undefined ? "" : visual.marca} flex size-6 items-center justify-center rounded-full border-2 ${
                        concluido ? "border-cor-sucesso bg-cor-sucesso" : "border-muted-foreground/20"
                      }`}
                    >
                      {concluido && <Check className="size-[calc(var(--tamanho-icone-interface)*0.875)] text-white" />}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className={agora === undefined ? "flex items-center gap-2" : visual.assunto}>
                    {agora !== undefined && onEditar ? <button type="button" className={visual.textoLembrete}
                      disabled={ocupado} onClick={() => onEditar(item)}>{item.texto}</button> : <span
                      className={"truncate font-medium " + (concluido ? "text-muted-foreground line-through" : "text-foreground")}>
                      {item.texto}
                    </span>}
                    {item.origemAutomatica && <PillDeStatus tom="ia" icone={<Bot aria-hidden className="size-3" />} className="shrink-0">
                      {textos.automatico}
                    </PillDeStatus>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {item.leadNome ? (() => {
                    const conteudo = <>
                      <AvatarIniciais id={item.leadId} nome={item.leadNome}
                        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white" />
                      <span className="truncate text-xs font-medium">{item.leadNome}</span>
                    </>;
                    return agora !== undefined && item.leadId && podeAbrirConversa
                      ? <Link href={"/atendimentos?leadId=" + encodeURIComponent(item.leadId) + "&visao=TODOS"} className={visual.lead}>{conteudo}</Link>
                      : <div className="flex min-w-0 items-center gap-2">{conteudo}</div>;
                  })() : <span className="text-xs text-muted-foreground">{textos.semVinculo}</span>}
                </td>
                <td className="px-4 py-3 text-xs font-medium">
                  {agora === undefined ? new Date(item.dataHora).toLocaleString("pt-BR") : <>
                    <time dateTime={item.dataHora}>{chaveDoDiaLocal(item.dataHora) === chaveDoDiaLocal(new Date(agora))
                      ? textos.v2.hoje : new Date(item.dataHora).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                      {" · "}{horaLocal(item.dataHora)}</time>
                    <div className={visual.tempoRelativo}>{concluido ? textos.status.concluido.toLowerCase()
                      : tempoRelativo(item.dataHora, agora)}</div>
                  </>}
                </td>
                {agora === undefined && <td className="px-4 py-3"><PillDeStatus tom={concluido ? "sucesso" : "atencao"}>
                    {concluido ? textos.status.concluido : textos.status.pendente}
                </PillDeStatus></td>}
                {mostrarAtendente && (
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <AvatarIniciais
                        id={item.atendenteId}
                        nome={item.atendenteNome}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                      />
                      <span className="truncate text-xs font-medium">{item.atendenteNome}</span>
                    </div>
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                  {onAdiar && !concluido && <MenuAdiamento textos={textos} ocupado={ocupado}
                    onEscolher={(data) => onAdiar(item, data)} />}
                  {onRemover && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:text-destructive"
                      aria-label={`${textos.remover} ${item.texto}`}
                      disabled={ocupado}
                      onClick={() => onRemover(item.id)}
                    >
                      <Trash2 className="size-(--tamanho-icone-interface)" />
                    </Button>
                  )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>;
      })}
    </div>
  );
}


function tempoRelativo(iso: string, agora: number) {
  const minutos = Math.round((Date.parse(iso) - agora) / 60_000);
  const unidade = Math.abs(minutos) < 60 ? 1 : Math.abs(minutos) < 1_440 ? 60 : 1_440;
  const formato = new Intl.RelativeTimeFormat("pt-BR", { style: "short" });
  return formato.format(Math.round(minutos / unidade), unidade === 1 ? "minute" : unidade === 60 ? "hour" : "day");
}

function MenuAdiamento({ textos, ocupado, onEscolher }: {
  textos: TextosLembretes;
  ocupado: boolean;
  onEscolher: (data: Date) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState(() => Date.now());
  const horarios = horariosDeAdiamento(inicio);
  const opcoes = [
    { id: "hora", rotulo: textos.v2.adiarHora },
    { id: "amanha", rotulo: textos.v2.amanha },
    { id: "segunda", rotulo: textos.v2.segunda },
  ] as const;
  return <Popover open={aberto} onOpenChange={(novo) => {
    if (novo) setInicio(Date.now());
    setAberto(novo);
  }}>
    <PopoverTrigger render={<Button size="icon" variant="ghost" disabled={ocupado}
      className="size-8" aria-label={textos.v2.adiar} />}>
      <Clock3 aria-hidden className="size-4" />
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={6} className={visual.menuAdiar}>
      <PopoverTitle>{textos.v2.adiarPara}</PopoverTitle>
      {opcoes.map(({ id, rotulo }) => <button key={id} type="button" onClick={() => {
        onEscolher(horarios[id]);
        setAberto(false);
      }}>{rotulo}<span aria-hidden>{id === "segunda" && horarios[id].toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " "}{horaLocal(horarios[id])}</span></button>)}
    </PopoverContent>
  </Popover>;
}

function agruparLembretes(itens: Lembrete[], agora: number, textos: TextosLembretes) {
  const hoje = new Date(agora);
  const amanha = new Date(agora);
  amanha.setDate(amanha.getDate() + 1);
  const diaAtual = chaveDoDiaLocal(hoje);
  const diaSeguinte = chaveDoDiaLocal(amanha);
  const grupos = {
    hoje: { id: "hoje", rotulo: textos.v2.hoje, itens: [] as Lembrete[] },
    amanha: { id: "amanha", rotulo: textos.v2.amanha, itens: [] as Lembrete[] },
    proximos: { id: "proximos", rotulo: textos.v2.proximos, itens: [] as Lembrete[] },
    concluidos: { id: "concluidos", rotulo: textos.v2.concluidos, itens: [] as Lembrete[] },
  };
  for (const item of itens) {
    const dia = chaveDoDiaLocal(item.dataHora);
    if (item.status === "CONCLUIDO") grupos.concluidos.itens.push(item);
    else if (dia <= diaAtual) grupos.hoje.itens.push(item);
    else if (dia === diaSeguinte) grupos.amanha.itens.push(item);
    else grupos.proximos.itens.push(item);
  }
  return Object.values(grupos).filter((grupo) => grupo.itens.length > 0);
}
