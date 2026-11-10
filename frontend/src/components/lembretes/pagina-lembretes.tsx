"use client";

import { OpcoesListaV2 } from "@/components/shell/opcoes-lista-v2";
import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import listaV2 from "@/components/shell/lista-v2.module.css";
import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";


import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Bot, Check, Clock3, Pencil, Trash2 } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { PillDeStatus } from "@/components/ui/pill-de-status";
import { Seletor } from "@/components/ui/seletor";
import { SeletorData } from "@/components/ui/seletor-data";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useTextos } from "@/lib/config/textos-provider";
import { useEquipe } from "@/lib/equipe/use-equipe";
import { chaveDoDiaLocal, periodoLocal } from "@/lib/suporte/agenda-de-datas";
import { atualizarLembrete, editarLembrete, listarLembretes, removerLembrete } from "@/lib/suporte/api";
import type { Lembrete, StatusLembrete } from "@/lib/suporte/types";

import { useCapacidades } from "@/lib/gestao/use-capacidades";

import { FormularioLembrete } from "./formulario-lembrete";

export function PaginaLembretes() {
  const layoutV2 = useFuncionalidadesHabilitadas().data?.includes("recursos_layout_v2") ?? false;
  const textos = useTextos().lembretes;
  const papel = useAuthStore((s) => s.papel);
  // Só apresentação: coluna de atendente para quem enxerga os lembretes da equipe.
  const gestor = ["SUBGESTOR", "GESTOR", "ADMINISTRADOR"].includes(papel ?? "");
  const capacidades = useCapacidades();
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
        pagina,
      }),
  });
  const atualizar = useMutation({
    mutationFn: ({ item, novo }: { item: Lembrete; novo: StatusLembrete }) =>
      atualizarLembrete(item, novo),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["lembretes"] }),
  });
  const adiar = useMutation({
    mutationFn: (item: Lembrete) => editarLembrete(item.id, {
      texto: item.texto, status: item.status,
      dataHora: new Date(Math.max(Date.now(), Date.parse(item.dataHora)) + 3_600_000).toISOString(),
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

  return (
    <div data-layout={layoutV2 ? "v2" : "legado"} className={layoutV2 ? `${listaV2.pagina} ${listaV2.modulo}` : "space-y-5 p-6"}>
      {layoutV2 && <CabecalhoListaV2 titulo={textos.titulo} />}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{textos.titulo}</h1>
          <p className="text-sm text-muted-foreground">{textos.descricao}</p>
        </div>
        {podeCriar && <Button onClick={() => setAberto(true)}>{textos.novo}</Button>}
      </header>

      {layoutV2 && <OpcoesListaV2<StatusLembrete | ""> rotulo={textos.filtros.status} valor={status}
        onChange={(valor) => mudarFiltro(() => setStatus(valor))}
        opcoes={[
          { valor: "", rotulo: textos.filtros.todos },
          { valor: "PENDENTE", rotulo: textos.status.pendente },
          { valor: "CONCLUIDO", rotulo: textos.status.concluido },
        ]} />}
      <div data-slot="recursos-painel" className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        {layoutV2 && <>
          <Input aria-label={textos.v2.buscar} placeholder={textos.v2.buscar} maxLength={150}
            className="w-full sm:w-64" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {podeFiltrarEquipe && Boolean(equipe.data?.length) && <Seletor
            ariaLabel={textos.colunas.atendente} placeholder={textos.v2.todosAtendentes} className="w-auto max-w-full"
            valor={atendente} opcoes={(equipe.data ?? []).map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
            onChange={(valor) => mudarFiltro(() => setAtendente(valor))} />}
          <Button variant={automaticos ? "default" : "outline"} aria-pressed={automaticos}
            onClick={() => mudarFiltro(() => setAutomaticos(!automaticos))}>
            <Bot aria-hidden />{textos.v2.soAutomaticos}
          </Button>
        </>}
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
        <p className="text-muted-foreground">{textos.vazio}</p>
      ) : (
        <TabelaDeLembretes
          itens={consulta.data.lembretes}
          mostrarAtendente={gestor}
          textos={textos}
          agora={layoutV2 ? agora : undefined}
          ocupado={atualizar.isPending || adiar.isPending || remover.isPending}
          onConcluir={podeEditarExcluir ? (item) => atualizar.mutate({
            item, novo: item.status === "CONCLUIDO" ? "PENDENTE" : "CONCLUIDO",
          }) : undefined}
          onAdiar={layoutV2 && podeEditarExcluir ? (item) => adiar.mutate(item) : undefined}
          onEditar={layoutV2 && podeEditarExcluir ? setEdicao : undefined}
          onRemover={podeEditarExcluir ? (id) => remover.mutate(id) : undefined}
        />
      )}

      <div className="flex justify-end gap-2">
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
      </div>

      <FormularioLembrete aberto={aberto && podeCriar} onFechar={() => setAberto(false)} />
      {edicao && podeEditarExcluir && <FormularioLembrete key={edicao.id} aberto existente={edicao}
        onFechar={() => setEdicao(null)} />}
    </div>
  );
}

type TextosLembretes = ReturnType<typeof useTextos>["lembretes"];

function TabelaDeLembretes({
  itens,
  mostrarAtendente,
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
  textos: TextosLembretes;
  onConcluir?: (item: Lembrete) => void;
  onRemover?: (id: string) => void;
  onAdiar?: (item: Lembrete) => void;
  onEditar?: (item: Lembrete) => void;
  agora?: number;
  ocupado: boolean;
}) {
  const grupos = agora === undefined ? [{ id: "lista", itens, rotulo: null }] : agruparLembretes(itens, agora, textos);
  return (
    <div data-slot="recursos-painel" className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/60">
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
        </thead>
        {grupos.map((grupo) => <tbody key={grupo.id}>
          {grupo.rotulo && <tr className="border-t bg-muted/40">
            <th scope="rowgroup" colSpan={mostrarAtendente ? 7 : 6} className="px-4 py-2 text-left text-xs font-semibold">
              {grupo.rotulo}
            </th>
          </tr>}
          {grupo.itens.map((item) => {
            const concluido = item.status === "CONCLUIDO";
            return (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-3">
                  {onConcluir ? (
                    <button
                      type="button"
                      aria-label={concluido && agora !== undefined ? textos.v2.reabrir : textos.concluir}
                      disabled={ocupado || (concluido && agora === undefined)}
                      onClick={() => onConcluir(item)}
                      className={`flex size-6 items-center justify-center rounded-full border-2 ${
                        concluido ? "border-cor-sucesso bg-cor-sucesso" : "border-muted-foreground/40"
                      }`}
                    >
                      {concluido && <Check className="size-[calc(var(--tamanho-icone-interface)*0.875)] text-white" />}
                    </button>
                  ) : (
                    <span
                      aria-hidden
                      className={`flex size-6 items-center justify-center rounded-full border-2 ${
                        concluido ? "border-cor-sucesso bg-cor-sucesso" : "border-muted-foreground/20"
                      }`}
                    >
                      {concluido && <Check className="size-[calc(var(--tamanho-icone-interface)*0.875)] text-white" />}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {item.origemAutomatica && (
                      <PillDeStatus tom="ia" icone={<Bot className="size-[calc(var(--tamanho-icone-interface)*0.75)]" />} className="shrink-0">
                        {textos.automatico}
                      </PillDeStatus>
                    )}
                    <p
                      className={`truncate font-medium ${concluido ? "text-muted-foreground line-through" : "text-foreground"}`}
                    >
                      {item.texto}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {item.leadNome ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <AvatarIniciais
                        id={item.leadId}
                        nome={item.leadNome}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                      />
                      <span className="truncate text-xs font-medium">{item.leadNome}</span>
                    </div>
                  ) : (
                    <span className="text-xs italic text-muted-foreground">{textos.semVinculo}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-medium text-muted-foreground">
                  {new Date(item.dataHora).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <PillDeStatus tom={concluido ? "sucesso" : "atencao"}>
                    {concluido ? textos.status.concluido : textos.status.pendente}
                  </PillDeStatus>
                </td>
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
                  {onAdiar && !concluido && <Button size="icon" variant="ghost" disabled={ocupado}
                    className="size-8" title={textos.v2.adiar} aria-label={textos.v2.adiar} onClick={() => onAdiar(item)}>
                    <Clock3 aria-hidden className="size-4" />
                  </Button>}
                  {onEditar && <Button size="icon" variant="ghost" disabled={ocupado} className="size-8"
                    title={textos.v2.editar} aria-label={textos.v2.editar} onClick={() => onEditar(item)}>
                    <Pencil aria-hidden className="size-4" />
                  </Button>}
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
        </tbody>)}
      </table>
    </div>
  );
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
