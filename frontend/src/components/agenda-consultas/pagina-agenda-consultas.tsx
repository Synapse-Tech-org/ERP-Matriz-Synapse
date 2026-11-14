"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarX2, ChevronLeft, ChevronRight, Plus, Search, Users } from "lucide-react";

import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import listaV2 from "@/components/shell/lista-v2.module.css";
import visual from "@/components/shell/agenda-recursos-v2.module.css";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { Input } from "@/components/ui/input";
import { SeletorData } from "@/components/ui/seletor-data";
import { Seletor } from "@/components/ui/seletor";
import { dataHoraCompleta, SeletorDataHora } from "@/components/ui/seletor-data-hora";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { criterioDosFiltrosAtivos } from "@/lib/agenda/use-agenda";
import { filtrarLeads } from "@/lib/agenda/api";
import { FILTROS_RAPIDOS_VAZIOS, type LeadDaAgenda } from "@/lib/agenda/types";
import { apiFetch } from "@/lib/api/http-client";
import { ErroDeApi } from "@/lib/api/errors";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";
import { useTextos } from "@/lib/config/textos-provider";
import type { Textos } from "@/lib/config/schema";
import { useCapacidades } from "@/lib/gestao/use-capacidades";
import { cn } from "@/lib/utils";

const ROTA = "/api/v1/agenda-consultas";
const ACOES = {
  AGENDADO: ["CONFIRMADO", "CHEGOU", "FALTOU", "CANCELADO"],
  CONFIRMADO: ["CHEGOU", "FALTOU", "CANCELADO"],
  CHEGOU: ["EM_ATENDIMENTO", "CANCELADO"],
  EM_ATENDIMENTO: ["ATENDIDO"],
  ATENDIDO: [],
  FALTOU: [],
  CANCELADO: [],
} as const;
type Estado = keyof typeof ACOES;
const DESTAQUES = ["AGENDADO", "CONFIRMADO", "CHEGOU", "EM_ATENDIMENTO", "ATENDIDO"] as const;
type Rotulos = Textos["agendaConsultas"];
interface Consulta {
  id: string;
  leadId: string;
  paciente: string;
  inicio: string;
  profissional: string;
  tipo: string;
  cobertura: string | null;
  estado: Estado;
  revisao: number;
}
interface AgendaDia {
  dia: string;
  hoje: string;
  fusoHorario: string;
  agenda: { itens: Consulta[]; limiteAtingido: boolean };
}

export function PaginaAgendaConsultas({ canceladas = false }: { canceladas?: boolean }) {
  const t = useTextos().agendaConsultas;
  const flags = useFuncionalidadesHabilitadas();
  if (flags.isError) return <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => void flags.refetch()} />;
  if (flags.isPending) return <p className="p-6" role="status">{t.carregando}</p>;
  if (!flags.data?.includes("variante_clinica")) return <p className="p-6" role="status">{t.desativada}</p>;
  return <Agenda permiteCancelamentos={flags.data.includes("cancelamentos")} canceladas={canceladas} />;
}

function mudarDia(dia: string, deslocamento: number) {
  const data = new Date(dia + "T12:00:00Z");
  data.setUTCDate(data.getUTCDate() + deslocamento);
  return data.toISOString().slice(0, 10);
}

function Agenda({ permiteCancelamentos, canceladas }: { permiteCancelamentos: boolean; canceladas: boolean }) {
  const textos = useTextos();
  const t = textos.agendaConsultas;
  const { pode } = useCapacidades();
  const usuario = useAuthStore((estado) => estado.usuarioId);
  const cache = useQueryClient();
  const [dia, setDia] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [estado, setEstado] = useState<Estado | "">(canceladas ? "CANCELADO" : "");
  const [aberto, setAberto] = useState<{ modo: "nova" } | { modo: "detalhe" | "reagendar"; id: string } | null>(null);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const consulta = useQuery({
    queryKey: ["agenda-consultas", usuario, dia, buscaAplicada, estado],
    queryFn: ({ signal }) => {
      const parametros = new URLSearchParams();
      if (dia) parametros.set("dia", dia);
      if (buscaAplicada) parametros.set("busca", buscaAplicada);
      if (estado) parametros.set("estado", estado);
      return apiFetch<AgendaDia>(ROTA + "?" + parametros, { signal });
    },
    retry: false,
  });
  const dados = consulta.data;
  const selecionada = aberto && aberto.modo !== "nova" ? dados?.agenda.itens.find((item) => item.id === aberto.id) : undefined;
  const podeEditar = pode("contatos.editar");
  const atualizar = () => cache.invalidateQueries({ queryKey: ["agenda-consultas", usuario] });
  const estadoDaConsulta = useMutation({
    mutationFn: ({ item, destino }: { item: Consulta; destino: Estado }) => apiFetch<void>(ROTA + "/" + item.id, {
      method: "PATCH", body: JSON.stringify({ revisao: item.revisao, estado: destino }),
    }),
    onSuccess: atualizar,
    onError: (erro) => { if (erro instanceof ErroDeApi && erro.status === 409) void atualizar(); },
  });
  function abrirDetalhe(id: string) {
    estadoDaConsulta.reset();
    setConfirmarCancelamento(false);
    setAberto({ modo: "detalhe", id });
  }
  const dataSelecionada = dados?.dia ?? dia;
  const dataDaSemana = dataSelecionada ? new Date(dataSelecionada + "T12:00:00Z").getUTCDay() : 0;
  const diasDaSemana = dataSelecionada
    ? Array.from({ length: 7 }, (_, indice) => mudarDia(dataSelecionada, indice - dataDaSemana))
    : [];
  const formatarData = (valor: string, formato: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { ...formato, timeZone: "UTC" }).format(new Date(valor + "T12:00:00Z"));
  const hora = (inicio: string) => dados && new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "short", timeZone: dados.fusoHorario,
  }).format(new Date(inicio));

  return (
    <div className={cn(listaV2.pagina, visual.paleta)}>
      <CabecalhoListaV2 titulo={t.titulo} busca={textos.gestao.v2.buscaGlobal} />
      <header>
        <div>
          <h1>{t.titulo}</h1>
          {dataSelecionada && <p className="mt-1 text-sm text-muted-foreground">
            {formatarData(dataSelecionada, { dateStyle: "full" })}
          </p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/agenda" className={buttonVariants({ variant: "outline" })}><Users aria-hidden />{t.pacientes}</Link>
          {permiteCancelamentos && pode("cancelamentos.ver") && (
            <Link href="/cancelamentos" className={buttonVariants({ variant: "outline" })}>
              <CalendarX2 aria-hidden />{textos.cancelamentos.titulo}
            </Link>
          )}
          {podeEditar && dados && <Button type="button" onClick={() => setAberto({ modo: "nova" })}><Plus aria-hidden />{t.nova}</Button>}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        {diasDaSemana.length > 0 && (
          <div aria-label={t.dia} role="group" className="grid grid-cols-7 gap-1 rounded-xl bg-muted p-1 sm:w-fit">
            {diasDaSemana.map((valor) => (
              <button key={valor} type="button" aria-pressed={valor === dataSelecionada}
                aria-label={formatarData(valor, { dateStyle: "full" })} onClick={() => setDia(valor)}
                className="grid min-w-0 place-items-center gap-1 rounded-lg px-1 py-2 text-muted-foreground hover:bg-card
                  aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-(--sombra-sm) sm:w-14">
                <span className="truncate text-xs">{formatarData(valor, { weekday: "short" })}</span>
                <strong className="text-sm tabular-nums">{valor.slice(8)}</strong>
              </button>
            ))}
          </div>
        )}
        <form className="flex flex-wrap items-center gap-2 rounded-[18px] border bg-card p-3 shadow-(--sombra-sm)"
          onSubmit={(e) => { e.preventDefault(); setBuscaAplicada(busca.trim()); }}>
          {dataSelecionada && (
            <div className="flex items-center gap-1">
              <Button type="button" size="icon" variant="outline" aria-label={t.diaAnterior} onClick={() => setDia(mudarDia(dataSelecionada, -1))}><ChevronLeft aria-hidden /></Button>
              <div className="w-36">
                <SeletorData valor={dataSelecionada} onChange={(valor) => { if (valor) setDia(valor); }} placeholder={t.dia} ariaLabel={t.dia} />
              </div>
              <Button type="button" size="icon" variant="outline" aria-label={t.diaSeguinte} onClick={() => setDia(mudarDia(dataSelecionada, 1))}><ChevronRight aria-hidden /></Button>
              <Button type="button" variant="ghost" onClick={() => setDia("")}>{t.hoje}</Button>
            </div>
          )}
          <Input className="w-full sm:max-w-72" aria-label={t.busca} placeholder={t.busca} maxLength={160}
            value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Seletor className="w-auto" ariaLabel={t.status} placeholder={t.todos} valor={estado}
            onChange={(valor) => setEstado(valor as Estado | "")}
            opcoes={(Object.keys(ACOES) as Estado[]).map((chave) => ({ valor: chave, rotulo: t.estados[chave] }))} />
          <Button type="submit" variant="outline"><Search aria-hidden />{t.buscar}</Button>
        </form>
        {dados && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {DESTAQUES.map((chave) => (
              <button type="button" key={chave} aria-pressed={estado === chave}
                onClick={() => setEstado(estado === chave ? "" : chave)}
                className="flex min-w-0 items-center gap-2 rounded-xl border bg-card p-3 text-left text-xs font-semibold
                  shadow-(--sombra-sm) hover:border-primary aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground">
                <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>{t.estados[chave]}</span>
                {!estado && !dados.agenda.limiteAtingido && <strong className="ml-auto tabular-nums">
                  {dados.agenda.itens.filter((item) => item.estado === chave).length}
                </strong>}
              </button>
            ))}
          </div>
        )}
        {consulta.isPending ? <p role="status" className="p-4 text-sm">{t.carregando}</p>
          : consulta.isError ? <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => void consulta.refetch()} />
          : <section aria-label={t.titulo} className="min-h-56 flex-1 overflow-auto rounded-[18px] border bg-card p-2 shadow-(--sombra-sm)">
              {dados?.agenda.limiteAtingido && <p role="status" className="px-3 py-2 text-sm">{t.limite}</p>}
              {dados?.agenda.itens.length === 0 ? (
                <div className="grid min-h-50 place-content-center gap-3 p-4 text-center text-sm text-muted-foreground" role="status">
                  <CalendarDays aria-hidden className="mx-auto size-7" />{t.vazio}
                </div>
              ) : <table className="hidden w-full min-w-[720px] text-left text-sm lg:table">
                <thead className="bg-muted/45 text-xs text-muted-foreground"><tr>
                  {[t.horario, t.paciente, t.procedimento, t.profissional, t.convenio, t.status, t.acoes].map((rotulo) =>
                    <th key={rotulo} scope="col" className="px-3 py-2.5 font-medium">{rotulo}</th>)}
                </tr></thead>
                <tbody>{dados?.agenda.itens.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-muted/25">
                    <td className="px-3 py-3 font-semibold tabular-nums">{hora(item.inicio)}</td>
                    <td className="px-3 py-3"><span className="flex items-center gap-2 font-semibold">
                      <AvatarIniciais id={item.leadId} nome={item.paciente} />{item.paciente}
                    </span></td>
                    <td className="px-3 py-3">{item.tipo}</td><td className="px-3 py-3">{item.profissional}</td>
                    <td className="px-3 py-3">{item.cobertura ?? textos.cancelamentos.naoInformado}</td>
                    <td className="px-3 py-3"><span className={cn("whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium",
                      item.estado === "CANCELADO" || item.estado === "FALTOU" ? "bg-destructive/10 text-destructive"
                        : item.estado === "AGENDADO" ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground")}>{t.estados[item.estado]}</span></td>
                    <td className="px-3 py-3"><Button size="sm" variant="outline" onClick={() => abrirDetalhe(item.id)}>{t.abrir}</Button></td>
                  </tr>
                ))}</tbody>
              </table>}
              <div className="grid gap-2 lg:hidden">
                {dados?.agenda.itens.map((item) => (
                  <article key={item.id} className="space-y-2 rounded-lg border p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <AvatarIniciais id={item.leadId} nome={item.paciente} />{item.paciente}
                    </p>
                    <p className="text-sm text-muted-foreground">{hora(item.inicio)} · {item.tipo} · {item.profissional}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{t.estados[item.estado]}</span>
                      <Button size="sm" variant="outline" onClick={() => abrirDetalhe(item.id)}>{t.abrir}</Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>}
      </div>
      {aberto?.modo === "detalhe" && selecionada && (
        <Dialog open onOpenChange={(v) => { if (!v) setAberto(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{selecionada.paciente}</DialogTitle>
              <DialogDescription>{hora(selecionada.inicio)} · {selecionada.tipo} · {selecionada.profissional}</DialogDescription></DialogHeader>
            <p className="text-sm font-semibold">{t.estados[selecionada.estado]}</p>
            {estadoDaConsulta.isError && <p role="alert" className="text-sm text-destructive">{mensagemDeErro(estadoDaConsulta.error, t)}</p>}
            {podeEditar && (
              <div className="flex flex-wrap gap-2">
                {ACOES[selecionada.estado].map((destino) => <Button key={destino} variant={destino === "CANCELADO" ? "destructive" : "outline"}
                  disabled={estadoDaConsulta.isPending} onClick={() => {
                    if (destino === "CANCELADO" && !confirmarCancelamento) setConfirmarCancelamento(true);
                    else {
                      setConfirmarCancelamento(false);
                      estadoDaConsulta.mutate({ item: selecionada, destino });
                    }
                  }}>{destino === "CANCELADO" && confirmarCancelamento ? t.confirmarCancelamento : t.transicoes[destino]}</Button>)}
                {(selecionada.estado === "AGENDADO" || selecionada.estado === "CONFIRMADO") && (
                  <Button variant="outline" disabled={estadoDaConsulta.isPending} onClick={() => setAberto({ modo: "reagendar", id: selecionada.id })}>{t.reagendar}</Button>
                )}
              </div>
            )}
            <DialogFooter>
              <Link href={"/agenda?paciente=" + encodeURIComponent(selecionada.leadId)} className={buttonVariants({ variant: "outline" })}>{t.abrirPaciente}</Link>
              <Button variant="outline" onClick={() => setAberto(null)}>{t.fechar}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {podeEditar && dados && (aberto?.modo === "nova" || (aberto?.modo === "reagendar" && selecionada)) && (
        <FormularioConsulta key={aberto.modo} t={t} fuso={dados.fusoHorario} usuario={usuario}
          item={aberto.modo === "reagendar" ? selecionada : undefined} fechar={() => setAberto(null)}
          aoSalvar={async (diaSalvo) => { setAberto(null); setDia(diaSalvo); await atualizar(); }} />
      )}
    </div>
  );
}

function mensagemDeErro(erro: unknown, t: Rotulos) {
  return erro instanceof ErroDeApi && erro.status === 409 ? t.conflito : t.erroSalvar;
}

function FormularioConsulta({ t, fuso, usuario, item, fechar, aoSalvar }: {
  t: Rotulos; fuso: string; usuario: string | null; item?: Consulta; fechar: () => void; aoSalvar: (dia: string) => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [paciente, setPaciente] = useState<LeadDaAgenda | null>(null);
  const [inicio, setInicio] = useState("");
  const [profissional, setProfissional] = useState("");
  const [tipo, setTipo] = useState("");
  const [cobertura, setCobertura] = useState("");
  const resultado = useQuery({
    queryKey: ["agenda-consultas-pacientes", usuario, busca],
    queryFn: ({ signal }) => filtrarLeads(criterioDosFiltrosAtivos({ ...FILTROS_RAPIDOS_VAZIOS, busca }, [], []), 0, 10, signal),
    enabled: !item && !paciente && busca.trim().length >= 2,
    gcTime: 0,
  });
  const salvar = useMutation({
    mutationFn: () => item
      ? apiFetch<void>(ROTA + "/" + item.id, { method: "PATCH", body: JSON.stringify({ revisao: item.revisao, inicio }) })
      : apiFetch<void>(ROTA, { method: "POST", body: JSON.stringify({ leadId: paciente?.id, inicio, profissional, tipo, cobertura }) }),
    onSuccess: () => aoSalvar(inicio.slice(0, 10)),
  });
  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (dataHoraCompleta(inicio) && (item || paciente)) salvar.mutate();
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !salvar.isPending) fechar(); }}>
      <DialogContent className="max-h-[85dvh] overflow-auto">
        <DialogHeader><DialogTitle>{item ? t.reagendar : t.nova}</DialogTitle>
          <DialogDescription>{t.noFuso.replace("{fuso}", fuso)}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={enviar}>
          {item ? <p className="text-sm font-semibold">{item.paciente} · {item.profissional}</p> : (
            <div className="space-y-2">
              <label className="grid gap-1 text-sm">{t.paciente}
                <Input placeholder={t.buscaPaciente} maxLength={160} value={paciente?.nome ?? busca}
                  onChange={(e) => { setPaciente(null); setBusca(e.target.value); }} />
              </label>
              {!paciente && busca.trim().length >= 2 && (
                resultado.isFetching ? <p role="status" className="text-sm">{t.carregando}</p>
                  : resultado.isError ? <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => void resultado.refetch()} />
                  : resultado.data?.leads.length === 0 ? <p role="status" className="text-sm">{t.semPacientes}</p>
                  : <ul className="max-h-32 overflow-auto rounded-lg border">{resultado.data?.leads.map((lead) =>
                    <li key={lead.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => setPaciente(lead)}>{lead.nome}{lead.telefone ? " · " + lead.telefone : ""}</button></li>)}</ul>
              )}
              {!paciente && <p className="text-xs text-muted-foreground">{t.escolhaPaciente}</p>}
            </div>
          )}
          <fieldset className="space-y-1 text-sm">
            <legend>{t.horario}</legend>
            <SeletorDataHora valor={inicio} onChange={setInicio} placeholderData={t.dia} obrigatorio
              rotuloHora={t.hora} rotuloMinuto={t.minuto} className="grid-cols-[minmax(0,1fr)_5rem_5rem]" />
          </fieldset>
          {!item && <>
            <label className="grid gap-1 text-sm">{t.profissional}<Input required maxLength={160} value={profissional} onChange={(e) => setProfissional(e.target.value)} /></label>
            <label className="grid gap-1 text-sm">{t.procedimento}<Input required maxLength={160} value={tipo} onChange={(e) => setTipo(e.target.value)} /></label>
            <label className="grid gap-1 text-sm">{t.convenio}<Input maxLength={160} value={cobertura} onChange={(e) => setCobertura(e.target.value)} /></label>
          </>}
          {salvar.isError && <p role="alert" className="text-sm text-destructive">{mensagemDeErro(salvar.error, t)}</p>}
          <DialogFooter>
            <Button variant="outline" type="button" disabled={salvar.isPending} onClick={fechar}>{t.fechar}</Button>
            <Button type="submit" disabled={salvar.isPending || !dataHoraCompleta(inicio) || (!item && !paciente)}>{salvar.isPending ? t.salvando : t.salvar}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
