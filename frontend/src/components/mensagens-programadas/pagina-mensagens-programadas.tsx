"use client";

import Link from "next/link";
import { OpcoesListaV2 } from "@/components/shell/opcoes-lista-v2";
import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import listaV2 from "@/components/shell/lista-v2.module.css";
import visual from "@/components/shell/agenda-recursos-v2.module.css";
import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";


import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CalendarDays, CheckCheck, CircleX, Clock3, Layers, MessageCircle, Pencil, Plus, RotateCw, Send, X } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button } from "@/components/ui/button";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { PillDeStatus } from "@/components/ui/pill-de-status";
import type { TomDePill } from "@/components/ui/pill-de-status";
import { Seletor } from "@/components/ui/seletor";
import { SeletorData } from "@/components/ui/seletor-data";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useTextos } from "@/lib/config/textos-provider";
import { useEquipe } from "@/lib/equipe/use-equipe";
import { chaveDoDiaLocal, horaLocal, periodoLocal } from "@/lib/suporte/agenda-de-datas";
import { cancelarMensagemProgramada, enviarMensagemProgramadaAgora, listarMensagensProgramadas } from "@/lib/suporte/api";
import type { MensagemProgramada, StatusMensagemProgramada } from "@/lib/suporte/types";

import { useCapacidades } from "@/lib/gestao/use-capacidades";

import { FormularioMensagemProgramada } from "./formulario-mensagem-programada";

const TOM_DO_STATUS: Record<StatusMensagemProgramada, TomDePill> = {
  AGENDADA: "atencao",
  ENVIADA: "sucesso",
  CANCELADA: "neutro",
};

const ICONE_DO_STATUS = { AGENDADA: Clock3, ENVIADA: CheckCheck, CANCELADA: CircleX };

export function PaginaMensagensProgramadas() {
  const layoutV2 = useFuncionalidadesHabilitadas().data?.includes("recursos_layout_v2") ?? false;
  const { mensagensProgramadas: t, menu } = useTextos();
  // Só apresentação: coluna de atendente para quem enxerga as mensagens da equipe.
  const gestor = ["SUBGESTOR", "GESTOR", "ADMINISTRADOR"].includes(useAuthStore((s) => s.papel) ?? "");
  const capacidades = useCapacidades();
  const podeAbrirConversa = capacidades.pode("atendimentos.ver");
  const podeCriar = capacidades.pode("mensagens_programadas.criar");
  const podeEditarCancelar = capacidades.pode("mensagens_programadas.editar_cancelar");
  const podeFiltrarEquipe = layoutV2 && gestor && capacidades.pode("equipe.ver");
  const equipe = useEquipe(podeFiltrarEquipe);
  const cache = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [reagendamento, setReagendamento] = useState<MensagemProgramada | null>(null);
  const [edicao, setEdicao] = useState<MensagemProgramada | null>(null);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [statusSelecionado, setStatus] = useState<StatusMensagemProgramada | "" | null>(null);
  const status = statusSelecionado ?? (layoutV2 ? "AGENDADA" : "");
  const [atendente, setAtendente] = useState("");
  const [pagina, setPagina] = useState(0);

  const periodoValido = !inicio || !fim || inicio <= fim;
  const atendenteId = podeFiltrarEquipe ? atendente || undefined : undefined;
  const consulta = useQuery({
    queryKey: ["mensagens-programadas", inicio, fim, status, pagina, atendenteId, layoutV2],
    enabled: periodoValido,
    queryFn: () =>
      listarMensagensProgramadas({
        ...periodoLocal(inicio, fim),
        atendenteId,
        status: status || undefined,
        incluirResumo: layoutV2,
        pagina,
      }),
  });
  const proximo = useQuery({
    queryKey: ["mensagens-programadas", "proximo", inicio, fim, atendenteId],
    enabled: layoutV2 && periodoValido,
    queryFn: async () => {
      const periodo = periodoLocal(inicio, fim);
      const agora = new Date().toISOString();
      if (periodo.fim && periodo.fim < agora) return null;
      const agendadas = await listarMensagensProgramadas({
        ...periodo, inicio: periodo.inicio && periodo.inicio > agora ? periodo.inicio : agora,
        status: "AGENDADA", atendenteId, pagina: 0,
      });
      return agendadas.mensagens[0] ?? null;
    },
  });
  const dataProximoEnvio = proximo.data?.dataEnvio;
  useEffect(() => {
    if (!layoutV2 || !dataProximoEnvio) return;
    const espera = Math.max(0, Date.parse(dataProximoEnvio) - Date.now()) + 1_000;
    if (espera > 2_147_483_647) return;
    const timer = window.setTimeout(() => {
      void cache.invalidateQueries({ queryKey: ["mensagens-programadas", "proximo"] });
    }, espera);
    return () => window.clearTimeout(timer);
  }, [cache, dataProximoEnvio, layoutV2]);

  const cancelar = useMutation({
    mutationFn: cancelarMensagemProgramada,
    onSuccess: () => cache.invalidateQueries({ queryKey: ["mensagens-programadas"] }),
  });

  const enviar = useMutation({
    mutationFn: enviarMensagemProgramadaAgora,
    onSuccess: () => cache.invalidateQueries({ queryKey: ["mensagens-programadas"] }),
  });
  const envioAceitoEm = enviar.isSuccess ? enviar.submittedAt : null;
  useEffect(() => {
    if (envioAceitoEm === null) return;
    const timer = window.setTimeout(() => {
      void cache.invalidateQueries({ queryKey: ["mensagens-programadas"] });
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [cache, envioAceitoEm]);

  function mudarFiltro(atualizar: () => void) {
    atualizar();
    setPagina(0);
  }

  const resumo = consulta.data?.resumo;
  return (
    <div data-layout={layoutV2 ? "v2" : "legado"} className={layoutV2 ? `${listaV2.pagina} ${listaV2.modulo} ${visual.paleta}` : "space-y-5 p-6"}>
      {layoutV2 && <CabecalhoListaV2 titulo={t.titulo} grupo={menu?.grupoRecursos} busca={t.v2.buscaContatos} />}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{layoutV2 ? t.v2.titulo : t.titulo}</h1>
          <p className="text-sm text-muted-foreground">{layoutV2 ? t.v2.descricao : t.descricao}</p>
        </div>
        {podeCriar && <Button data-slot={layoutV2 ? "lista-v2-acao" : "button"} onClick={() => setNovo(true)}>
          {layoutV2 && <Plus aria-hidden />}{t.nova}
        </Button>}
      </header>

      <div className={layoutV2 ? visual.barra : "flex flex-wrap items-end gap-3 rounded-lg border p-3"}>
      {layoutV2 && <OpcoesListaV2<StatusMensagemProgramada | ""> rotulo={t.filtros.status} valor={status}
        onChange={(valor) => mudarFiltro(() => setStatus(valor))}
        opcoes={[
          { valor: "AGENDADA", rotulo: t.v2.agendadas, total: resumo?.agendadas, icone: <Clock3 aria-hidden className="size-4" /> },
          { valor: "ENVIADA", rotulo: t.v2.enviadas, total: resumo?.enviadas, icone: <CheckCheck aria-hidden className="size-4" /> },
          { valor: "CANCELADA", rotulo: t.v2.canceladas, total: resumo?.canceladas, icone: <CircleX aria-hidden className="size-4" /> },
          { valor: "", rotulo: t.v2.todas, total: resumo?.total, icone: <Layers aria-hidden className="size-4" /> },
        ]} />}
        {layoutV2 ? (
          <div className={visual.periodo}>
            <CalendarDays aria-hidden className="size-4 shrink-0" />
            <SeletorData ariaLabel={t.filtros.inicio} placeholder={t.v2.formatoData} valor={inicio}
              onChange={(valor) => mudarFiltro(() => setInicio(valor))} />
            <span aria-hidden>→</span>
            <SeletorData ariaLabel={t.filtros.fim} placeholder={t.v2.formatoData} valor={fim}
              onChange={(valor) => mudarFiltro(() => setFim(valor))} />
            {(inicio || fim) && <button type="button" className={visual.limparPeriodo} aria-label={t.v2.limparPeriodo}
              onClick={() => mudarFiltro(() => { setInicio(""); setFim(""); })}>
              <X aria-hidden className="size-4" />
            </button>}
          </div>
        ) : <>
          <label className="text-sm">
            {t.filtros.inicio}
            <SeletorData
              valor={inicio}
              placeholder={t.filtros.inicio}
              onChange={(valor) => mudarFiltro(() => setInicio(valor))}
            />
          </label>
          <label className="text-sm">
            {t.filtros.fim}
            <SeletorData
              valor={fim}
              placeholder={t.filtros.fim}
              onChange={(valor) => mudarFiltro(() => setFim(valor))}
            />
          </label>
        </>}
        {podeFiltrarEquipe && Boolean(equipe.data?.length) && <Seletor
          ariaLabel={t.colunas.atendente} placeholder={t.v2.todosAtendentes} className="w-auto max-w-full"
          valor={atendente} opcoes={(equipe.data ?? []).map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
          onChange={(valor) => mudarFiltro(() => setAtendente(valor))} />}
        {!layoutV2 && <label className="text-sm">
          {t.filtros.status}
          <Seletor
            className="ml-2"
            valor={status}
            placeholder={t.filtros.todos}
            opcoes={[
              { valor: "AGENDADA", rotulo: t.status.agendada },
              { valor: "ENVIADA", rotulo: t.status.enviada },
              { valor: "CANCELADA", rotulo: t.status.cancelada },
            ]}
            onChange={(valor) =>
              mudarFiltro(() => setStatus(valor as StatusMensagemProgramada | ""))
            }
          />
        </label>}
      {layoutV2 && periodoValido && proximo.data && <div className={visual.proximo}>
        <Send aria-hidden className="size-3.5" />
        <span className="text-muted-foreground">{t.v2.proximoEnvio}</span>
        <time dateTime={proximo.data.dataEnvio} className="font-semibold">{new Date(proximo.data.dataEnvio).toLocaleString("pt-BR")}</time>
        <span className="break-words font-medium">{proximo.data.leadNome}</span>
      </div>}
      </div>
      {enviar.isSuccess && <p className={visual.confirmacaoEnvio} role="status">{t.v2.envioSolicitado}</p>}
      {(enviar.isError || cancelar.isError) && <p className="text-sm text-destructive" role="alert">{t.v2.erroOperacao}</p>}
      {!periodoValido ? <p role="status">{t.v2?.periodoInvalido ?? t.vazio}</p> : consulta.isLoading ? (
        <p>{t.carregando}</p>
      ) : consulta.isError ? (
        <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => consulta.refetch()} />
      ) : !consulta.data?.mensagens.length ? (
        layoutV2 ? <div className={visual.vazio}>
          <span className={visual.vazioIcone + " " + visual.vazioAgenda}><CalendarDays aria-hidden className="size-6" /></span>
          <strong>{t.v2.vazioTitulo}</strong><span>{t.v2.vazioDescricao}</span>
        </div> : <p className="text-muted-foreground">{t.vazio}</p>
      ) : (
        <TabelaDeMensagensProgramadas
          itens={consulta.data.mensagens}
          mostrarAtendente={layoutV2 || gestor}
          podeAbrirConversa={layoutV2 && podeAbrirConversa}
          agrupar={layoutV2}
          cancelando={cancelar.isPending || enviar.isPending}
          onEnviar={layoutV2 && podeEditarCancelar ? (id) => enviar.mutate(id) : undefined}
          onReagendar={layoutV2 && podeCriar ? setReagendamento : undefined}
          textos={t}
          onEditar={podeEditarCancelar ? setEdicao : undefined}
          onCancelar={podeEditarCancelar ? (id) => cancelar.mutate(id) : undefined}
        />
      )}

      {(!layoutV2 || pagina > 0 || consulta.data?.temMais) && <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={!pagina} onClick={() => setPagina((p) => p - 1)}>
          {t.paginacao.anterior}
        </Button>
        <Button
          variant="outline"
          disabled={!consulta.data?.temMais}
          onClick={() => setPagina((p) => p + 1)}
        >
          {t.paginacao.proxima}
        </Button>
      </div>}

      <FormularioMensagemProgramada
        key={novo ? "novo-aberto" : "novo-fechado"}
        visualV2={layoutV2}
        aberto={novo && podeCriar}
        onFechar={() => setNovo(false)}
      />
      {reagendamento && podeCriar && <FormularioMensagemProgramada key={reagendamento.id}
        visualV2 aberto leadId={reagendamento.leadId} leadNome={reagendamento.leadNome}
        conteudoInicial={reagendamento.conteudo} titulo={t.v2.reagendar} onFechar={() => setReagendamento(null)} />}
      {edicao && podeEditarCancelar && (
        <FormularioMensagemProgramada
          key={edicao.id}
          visualV2={layoutV2}
          aberto
          existente={edicao}
          onFechar={() => setEdicao(null)}
        />
      )}
    </div>
  );
}

type TextosMensagensProgramadas = ReturnType<typeof useTextos>["mensagensProgramadas"];

function TabelaDeMensagensProgramadas({
  itens,
  mostrarAtendente,
  podeAbrirConversa,
  onEnviar,
  onReagendar,
  textos,
  onEditar,
  onCancelar,
  agrupar,
  cancelando,
}: {
  itens: MensagemProgramada[];
  mostrarAtendente: boolean;
  podeAbrirConversa: boolean;
  onEnviar?: (id: string) => void;
  onReagendar?: (mensagem: MensagemProgramada) => void;
  textos: TextosMensagensProgramadas;
  onEditar?: (mensagem: MensagemProgramada) => void;
  onCancelar?: (id: string) => void;
  agrupar: boolean;
  cancelando: boolean;
}) {
  const hoje = chaveDoDiaLocal(new Date().toISOString());
  const dias = new Map<string, MensagemProgramada[]>();
  for (const mensagem of itens) {
    const dia = agrupar ? chaveDoDiaLocal(mensagem.dataEnvio) : "";
    const grupo = dias.get(dia);
    if (grupo) grupo.push(mensagem);
    else dias.set(dia, [mensagem]);
  }
  return (
    <div className={agrupar ? visual.lista : undefined}>
      {[...dias].map(([dia, mensagens]) => <div key={dia} className={agrupar ? visual.cartao : "overflow-x-auto rounded-lg border border-border bg-card"}>
      <table className={"w-full text-sm " + (agrupar ? visual.programadasTabela : "")}>
        {agrupar && <colgroup>
          <col /><col /><col />{mostrarAtendente && <col />}<col /><col />
        </colgroup>}
        {!agrupar && <thead className="bg-muted/60">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.lead}
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.conteudo}
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.data}
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
          {dia && <tr>
            <th scope="rowgroup" colSpan={mostrarAtendente ? 6 : 5} className={visual.grupo + " text-left"}>
              <span>
                <small aria-hidden className={visual.dia} data-hoje={dia === hoje}>
                  {new Date(mensagens[0].dataEnvio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </small>
                <time dateTime={dia}>{new Date(mensagens[0].dataEnvio).toLocaleDateString("pt-BR", { dateStyle: "full" })}</time>
                <small className={visual.total}>{(mensagens.length === 1 ? textos.v2.mensagemNoDia : textos.v2.mensagensNoDia)
                  .replace("{total}", String(mensagens.length))}</small>
              </span>
            </th>
          </tr>}
          {mensagens.map((mensagem) => {
            const editavel = mensagem.status === "AGENDADA";
            const IconeStatus = ICONE_DO_STATUS[mensagem.status];
            const hora = (
              <td className={agrupar ? "px-4 py-3 font-mono font-medium text-foreground" : "px-4 py-3 text-xs font-medium text-muted-foreground"}>
                  {agrupar ? <><time dateTime={mensagem.dataEnvio}>{horaLocal(mensagem.dataEnvio)}</time>
                    <div className={visual.tempoRelativo}>{mensagem.status === "AGENDADA" ? prazoEnvio(mensagem.dataEnvio) : textos.status[mensagem.status.toLowerCase() as "enviada" | "cancelada"].toLowerCase()}</div></>
                    : new Date(mensagem.dataEnvio).toLocaleString("pt-BR")}
                </td>
            );
            const estado = (
              <td className="px-4 py-3">
                  {agrupar ? <span className={visual.status} data-tom={mensagem.status}>
                    <IconeStatus aria-hidden className="size-3.5" />
                    {textos.status[mensagem.status.toLowerCase() as "agendada" | "enviada" | "cancelada"]}
                  </span> : <PillDeStatus tom={TOM_DO_STATUS[mensagem.status]}>
                    {textos.status[mensagem.status.toLowerCase() as "agendada" | "enviada" | "cancelada"]}
                  </PillDeStatus>}
                </td>
            );
            return (
              <tr
                key={mensagem.id}
                data-status={mensagem.status}
                className={
                  editavel
                    ? "border-t border-border border-l-4 border-l-primary bg-primary/10"
                    : "border-t border-border"
                }
              >
                {agrupar && hora}
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AvatarIniciais
                      id={mensagem.leadId}
                      nome={mensagem.leadNome}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    />
                    <span className="truncate font-bold text-foreground">{mensagem.leadNome}</span>
                  </div>
                </td>
                <td className={agrupar ? visual.conteudoProgramada : "max-w-xs px-4 py-3 truncate text-muted-foreground"}>
                  <span>{mensagem.conteudo}</span>
                </td>
                {!agrupar && hora}
                {!agrupar && estado}
                {mostrarAtendente && (
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <AvatarIniciais
                        id={mensagem.atendenteId}
                        nome={mensagem.atendenteNome}
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      />
                      <span className="truncate text-xs font-medium">{mensagem.atendenteNome}</span>
                    </div>
                  </td>
                )}
                {agrupar && estado}
                <td className="px-4 py-3 text-right">
                  {editavel && onEditar && onCancelar && (
                    <div className="flex items-center justify-end gap-1">
                      {onEnviar && <Button size="icon" variant="ghost" className="size-8"
                        aria-label={textos.v2.enviarAgora} title={textos.v2.enviarAgora}
                        disabled={cancelando} onClick={() => onEnviar(mensagem.id)}><Send aria-hidden className="size-4" /></Button>}
                      <Button size="sm" variant="outline" disabled={cancelando} onClick={() => onEditar(mensagem)}>
                        {agrupar && <Pencil aria-hidden className="size-3.5" />}{textos.editar}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        aria-label={`${textos.cancelar} ${mensagem.leadNome}`}
                        disabled={cancelando}
                        onClick={() => onCancelar(mensagem.id)}
                      >
                        {agrupar ? <CircleX aria-hidden className="size-4" /> : <X className="size-(--tamanho-icone-interface)" />}
                      </Button>
                    </div>
                  )}
                  {agrupar && mensagem.status === "ENVIADA" && podeAbrirConversa && <Link
                    href={"/atendimentos?leadId=" + encodeURIComponent(mensagem.leadId) + "&visao=TODOS"} className={visual.acaoProgramada}>
                    <MessageCircle aria-hidden className="size-3.5" />{textos.v2.verNoChat}
                  </Link>}
                  {agrupar && mensagem.status === "CANCELADA" && onReagendar && <Button size="sm" variant="outline"
                    disabled={cancelando} onClick={() => onReagendar(mensagem)}>
                    <RotateCw aria-hidden className="size-3.5" />{textos.v2.reagendar}
                  </Button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>)}
    </div>
  );
}

function prazoEnvio(iso: string) {
  const horas = Math.round((Date.parse(iso) - Date.now()) / 3_600_000);
  const dias = Math.abs(horas) >= 24;
  return new Intl.RelativeTimeFormat("pt-BR", { style: "short" })
    .format(dias ? Math.round(horas / 24) : horas, dias ? "day" : "hour");
}
