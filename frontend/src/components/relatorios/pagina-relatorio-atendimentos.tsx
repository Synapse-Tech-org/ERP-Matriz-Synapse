"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, ArrowUpRight, Download, Hourglass, Search, Star, X } from "lucide-react";

import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import { OpcoesListaV2 } from "@/components/shell/opcoes-lista-v2";
import moldura from "@/components/shell/lista-v2.module.css";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { Input } from "@/components/ui/input";
import { Seletor } from "@/components/ui/seletor";
import { SeletorData } from "@/components/ui/seletor-data";
import { ErroDeApi } from "@/lib/api/errors";
import type { Textos } from "@/lib/config/schema";
import { useTextos } from "@/lib/config/textos-provider";
import { useCapacidades } from "@/lib/gestao/use-capacidades";
import { useTimelineDoLead } from "@/lib/lead/use-painel-lead";
import { baixarBlobComoArquivo } from "@/lib/midia/baixar-arquivo";
import {
  consultarRelatorio, exportarRelatorio, TAMANHO_PAGINA_RELATORIO,
  type FiltrosRelatorio, type GrupoRelatorio, type LinhaRelatorio, type PeriodoRelatorio,
  type StatusRelatorio,
} from "@/lib/relatorios/api";

import estilos from "./relatorio-atendimentos.module.css";

const FILTROS_INICIAIS: FiltrosRelatorio = {
  periodo: "TRINTA_DIAS", inicio: "", fim: "", busca: "", status: "", etapa: "", atendente: "",
};
const STATUS = ["EM_IA", "EM_ATENDIMENTO", "FINALIZADO"] as const;
const numeros = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const tempo = new Intl.NumberFormat("pt-BR", { style: "unit", unit: "minute", unitDisplay: "short", maximumFractionDigits: 1 });

export function PaginaRelatorioAtendimentos() {
  const { relatorios: t, menu, gestao } = useTextos();
  const capacidades = useCapacidades();
  const podeExportar = capacidades.pode("relatorios.exportar");
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [pagina, setPagina] = useState(0);
  const [selecionada, setSelecionada] = useState<LinhaRelatorio | null>(null);
  const personalizado = filtros.periodo === "PERSONALIZADO";
  const periodoValido = !personalizado || Boolean(filtros.inicio && filtros.fim && filtros.inicio <= filtros.fim);
  const digitando = buscaDigitada.trim() !== filtros.busca;

  useEffect(() => {
    if (!digitando) return;
    const timer = setTimeout(() => {
      setFiltros((atuais) => ({ ...atuais, busca: buscaDigitada.trim() }));
      setPagina(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaDigitada, digitando]);

  const consulta = useQuery({
    queryKey: ["relatorios", "atendimentos", filtros, pagina],
    queryFn: ({ signal }) => consultarRelatorio(filtros, pagina, signal),
    enabled: periodoValido,
  });
  const exportacao = useMutation({
    mutationFn: exportarRelatorio,
    onSuccess: ({ blob, nome }) => baixarBlobComoArquivo(blob, nome ?? t.arquivo),
  });

  function alterar(alterados: Partial<FiltrosRelatorio>) {
    setFiltros((atuais) => ({ ...atuais, ...alterados }));
    setPagina(0);
    exportacao.reset();
  }

  const dados = periodoValido ? consulta.data : undefined;
  const resumo = dados?.resumo;
  const quantidadePaginas = Math.max(1, Math.ceil((resumo?.total ?? 0) / TAMANHO_PAGINA_RELATORIO));
  const data = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short", timeZone: dados?.fusoHorario,
  });
  const formatoData = (valor: string | null) => valor ? data.format(new Date(valor)) : t.semValor;
  const periodos = (Object.entries(t.periodos) as [PeriodoRelatorio, string][])
    .map(([valor, rotulo]) => ({ valor, rotulo }));
  const totalSemFiltro = dados?.porStatus.reduce((soma, grupo) => soma + grupo.total, 0) ?? 0;
  const opcoesStatus = [
    { valor: "" as const, rotulo: t.todosStatus, total: totalSemFiltro },
    ...STATUS.map((valor) => ({
      valor, rotulo: t.statusRotulos[valor], total: dados?.porStatus.find((grupo) => grupo.id === valor)?.total ?? 0,
    })),
  ];

  const filtrosAtivos = [
    { chave: "busca", valor: filtros.busca, rotulo: filtros.busca },
    { chave: "etapa", valor: filtros.etapa, rotulo: dados?.porEtapa.find((item) => item.id === filtros.etapa)?.nome },
    { chave: "atendente", valor: filtros.atendente, rotulo: dados?.porAtendente.find((item) => item.id === filtros.atendente)?.nome },
    { chave: "status", valor: filtros.status, rotulo: filtros.status && t.statusRotulos[filtros.status] },
  ] as const;

  return (
    <section data-layout="v2" className={moldura.pagina + " " + moldura.modulo + " " + estilos.pagina}>
      <CabecalhoListaV2 titulo={t.titulo} grupo={menu.grupoGestao} busca={gestao.v2.buscaGlobal} />
      <header>
        <div className="space-y-1">
          <h1>{t.titulo}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitulo}</p>
        </div>
        <div className={estilos.acoes}>
          {personalizado && <div className={estilos.acoes}>
            <label className="grid gap-1 text-xs text-muted-foreground">{t.inicio}
              <SeletorData valor={filtros.inicio} placeholder={t.inicio} onChange={(inicio) => alterar({ inicio })} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">{t.fim}
              <SeletorData valor={filtros.fim} placeholder={t.fim} onChange={(fim) => alterar({ fim })} />
            </label>
          </div>}
          <OpcoesListaV2 rotulo={t.periodo} valor={filtros.periodo} opcoes={periodos}
            onChange={(periodo) => alterar({ periodo })} />
          {podeExportar && <Button variant="outline" onClick={() => exportacao.mutate(filtros)}
            disabled={!resumo?.total || digitando || consulta.isFetching || exportacao.isPending}>
            <Download aria-hidden />{exportacao.isPending ? t.exportando : t.exportar}
          </Button>}
        </div>
      </header>

      {exportacao.isError && <p role="alert" className="text-sm text-destructive">
        {exportacao.error instanceof ErroDeApi && exportacao.error.status === 422 ? t.exportacaoLimite : t.exportacaoErro}
      </p>}
      {!periodoValido && <p role="status">{t.periodoInvalido}</p>}
      {periodoValido && consulta.isError && <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => consulta.refetch()} />}
      {periodoValido && consulta.isPending && <p role="status">{t.carregando}</p>}
      {resumo && dados && <>
        <div className={estilos.kpis}>
          <Indicador icone={ClipboardList} tom="azul" titulo={t.atendimentos} valor={numeros.format(resumo.total)}
            legenda={t.emAberto.replace("{total}", numeros.format(resumo.total - resumo.finalizados))} />
          <Indicador icone={CheckCircle2} tom="verde" titulo={t.finalizados} valor={numeros.format(resumo.finalizados)}
            legenda={resumo.total ? t.percentualFinalizado.replace("{percentual}", percentual.format(resumo.finalizados / resumo.total)) : undefined} />
          <Indicador icone={Hourglass} tom="verde" titulo={t.tma} valor={formatarDuracao(resumo.duracaoMediaSegundos, t.semValor)}
            legenda={t.legendaTma} />
          <Indicador icone={Star} tom="atencao" titulo={t.csat} valor={resumo.csatMedio === null ? t.semValor : numeros.format(resumo.csatMedio)}
            legenda={t.avaliacoes.replace("{total}", numeros.format(resumo.avaliacoes))} />
        </div>
        <div className={estilos.graficos}>
          <Grafico titulo={t.status} grupos={dados.porStatus.map((grupo) => ({
            ...grupo, nome: t.statusRotulos[grupo.id as StatusRelatorio],
          }))} ativo={filtros.status} semNome={t.semValor} vazio={t.vazio} distribuicao legenda={t.totalStatus.replace("{total}", numeros.format(totalSemFiltro))}
            selecionar={(status) => alterar({ status: status as StatusRelatorio | "" })} />
          <Grafico titulo={t.etapaAtual} grupos={dados.porEtapa} ativo={filtros.etapa} semNome={t.semEtapa} vazio={t.vazio}
            selecionar={(etapa) => alterar({ etapa })} />
          <Grafico titulo={t.porAtendente} grupos={dados.porAtendente} ativo={filtros.atendente} semNome={t.semResponsavel}
            vazio={t.vazio} csat={t.csat} legenda={t.volumeCsat} selecionar={(atendente) => alterar({ atendente })} />
        </div>
      </>}

      <section className={estilos.cartao}>
        <div className={estilos.cabecalhoTabela}>
          <div className="mr-auto">
            <h2>{t.atendimentos}</h2>
            {resumo && <p className="text-xs text-muted-foreground">
              {t.resultado.replace("{total}", numeros.format(resumo.total))}
            </p>}
          </div>
          <div className={estilos.buscaTabela}>
            <Search aria-hidden />
            <Input placeholder={t.busca} aria-label={t.busca} maxLength={150}
              value={buscaDigitada} onChange={(e) => setBuscaDigitada(e.target.value)} />
          </div>
          <Seletor ariaLabel={t.etapa} valor={filtros.etapa} onChange={(etapa) => alterar({ etapa })}
            placeholder={t.todasEtapas} className="w-auto max-w-full" opcoes={opcoesDeGrupo(dados?.porEtapa)} />
          <Seletor ariaLabel={t.responsavel} valor={filtros.atendente} onChange={(atendente) => alterar({ atendente })}
            placeholder={t.todosAtendentes} className="w-auto max-w-full" opcoes={opcoesDeGrupo(dados?.porAtendente)} />
          <OpcoesListaV2 rotulo={t.status} valor={filtros.status} opcoes={opcoesStatus} onChange={(status) => alterar({ status })} />
        </div>
        {filtrosAtivos.some(({ valor }) => valor) && <div className={estilos.filtros}>
          <span>{t.filtrosAtivos}</span>
          {filtrosAtivos.filter(({ valor }) => valor).map(({ chave, rotulo }) => {
            const nome = rotulo || t[chave === "atendente" ? "responsavel" : chave];
            return <button key={chave} type="button" aria-label={t.removerFiltro.replace("{filtro}", nome)}
              onClick={() => {
                if (chave === "busca") setBuscaDigitada("");
                alterar({ [chave]: "" });
              }}>{nome}<X aria-hidden /></button>;
          })}
          <Button variant="ghost" size="sm" onClick={() => {
            setBuscaDigitada("");
            alterar({ etapa: "", atendente: "", status: "", busca: "" });
          }}>{t.limpar}</Button>
        </div>}
        {dados && (dados.linhas.length > 0 ? (
          <div className={estilos.tabela}>
            <table aria-label={t.atendimentos}>
              <thead><tr>
                <th scope="col">{t.cliente}</th><th scope="col">{t.responsavel}</th><th scope="col">{t.etapa}</th>
                <th scope="col">{t.status}</th><th scope="col">{t.inicio}</th><th scope="col">{t.duracao}</th><th scope="col">{t.csatNota}</th>
              </tr></thead>
              <tbody>{dados.linhas.map((linha) => (
                <tr key={linha.id}>
                  <th scope="row">
                    <button type="button" className={estilos.cliente} onClick={() => setSelecionada(linha)}>
                      <AvatarIniciais id={linha.leadId} nome={linha.cliente} className={estilos.avatar} />
                      <span><strong>{linha.cliente}</strong><small>{linha.empresa ?? linha.id}</small></span>
                    </button>
                  </th>
                  <td>{linha.atendente ?? t.semResponsavel}</td><td><span className={estilos.etapa}>{linha.etapa ?? t.semEtapa}</span></td>
                  <td><span className={estilos.status} data-status={linha.status}>{t.statusRotulos[linha.status]}</span></td>
                  <td>{formatoData(linha.iniciadoEm)}</td><td>{formatarDuracao(linha.duracaoSegundos, t.semValor)}</td>
                  <td>{linha.csat === null ? t.semValor : numeros.format(linha.csat)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t.vazio}</p>)}
        {dados && (pagina > 0 || quantidadePaginas > 1) && <nav aria-label={t.atendimentos} className={estilos.paginacao}>
          <span>{t.pagina.replace("{atual}", String(pagina + 1)).replace("{total}", String(quantidadePaginas))}</span>
          <Button variant="outline" disabled={pagina === 0 || consulta.isFetching} onClick={() => setPagina((p) => p - 1)}>{t.anterior}</Button>
          <Button variant="outline" disabled={pagina + 1 >= quantidadePaginas || consulta.isFetching} onClick={() => setPagina((p) => p + 1)}>{t.proxima}</Button>
        </nav>}
      </section>
      {selecionada && <Detalhes linha={selecionada} textos={t} formatoData={formatoData} podeAbrir={capacidades.pode("atendimentos.ver")} fechar={() => setSelecionada(null)} />}
    </section>
  );
}

function opcoesDeGrupo(grupos?: GrupoRelatorio[]) {
  return (grupos ?? []).flatMap(({ id, nome }) => id && nome ? [{ valor: id, rotulo: nome }] : []);
}

function formatarDuracao(segundos: number | null, vazio: string) {
  return segundos === null ? vazio : tempo.format(segundos / 60);
}

function Indicador({ icone: Icone, titulo, valor, legenda, tom }: {
  icone: typeof ClipboardList; titulo: string; valor: string; legenda?: string; tom: "azul" | "verde" | "atencao";
}) {
  return <section className={estilos.indicador}>
    <h2><span data-tom={tom} className={estilos.iconeIndicador}><Icone aria-hidden /></span>{titulo}</h2>
    <strong>{valor}</strong>
    {legenda && <p className="text-xs text-muted-foreground">{legenda}</p>}
  </section>;
}

function Grafico({ titulo, grupos, ativo, semNome, vazio, csat, distribuicao, legenda, selecionar }: {
  titulo: string; grupos: GrupoRelatorio[]; ativo: string; semNome: string;
  vazio: string; csat?: string; distribuicao?: boolean; legenda?: string; selecionar: (id: string) => void;
}) {
  const maior = Math.max(1, ...grupos.map((grupo) => grupo.total));
  const totalGeral = grupos.reduce((soma, grupo) => soma + grupo.total, 0);
  const tipo = distribuicao ? "status" : csat ? "atendente" : "etapa";
  return <section className={estilos.grafico} data-tipo={tipo}>
    <header><h2>{titulo}</h2>{legenda && <span>{legenda}</span>}</header>
    {distribuicao && grupos.length > 0 && <div aria-hidden className={estilos.distribuicao}>
      {grupos.map(({ id, total }) => <span key={id} data-status={id} style={{ flexGrow: total }} />)}
    </div>}
    {grupos.length ? <ul>{grupos.map(({ id, nome, total, csatMedio }) => {
      const conteudo = <>
        {distribuicao && <span aria-hidden className={estilos.ponto} data-status={id} />}
        {csat && (nome ? <AvatarIniciais id={id ?? nome} nome={nome} className={estilos.avatarGrafico} />
          : <span aria-hidden className={estilos.avatarGrafico} />)}
        <span className="truncate">{nome ?? semNome}</span>
        {tipo === "etapa" && <span aria-hidden className={estilos.trilho}><span style={{ width: (total / maior * 100) + "%" }} /></span>}
        <strong>{numeros.format(total)}</strong>
        {distribuicao && <span className={estilos.percentual}>{percentual.format(totalGeral ? total / totalGeral : 0)}</span>}
        {csat && <span title={csat} className={estilos.nota}><Star aria-hidden />{csatMedio === null ? "—" : numeros.format(csatMedio)}</span>}
      </>;
      return <li key={id ?? "sem-grupo"}>{id
        ? <button type="button" className={estilos.barra} aria-pressed={ativo === id}
            onClick={() => selecionar(ativo === id ? "" : id)}>{conteudo}</button>
        : <div className={estilos.barra}>{conteudo}</div>}</li>;
    })}</ul> : <p className="mt-3 text-sm text-muted-foreground">{vazio}</p>}
  </section>;
}

function Detalhes({ linha, textos: t, formatoData, podeAbrir, fechar }: {
  linha: LinhaRelatorio; textos: Textos["relatorios"]; formatoData: (v: string | null) => string; podeAbrir: boolean; fechar: () => void;
}) {
  const jornada = useTimelineDoLead(linha.leadId);
  const eventos = jornada.data?.pages.flatMap((p) => p.eventos).filter((evento) => evento.tipo === "ETAPA_ALTERADA") ?? [];
  return <Dialog open onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
    <DialogContent className={estilos.detalhes} showCloseButton={false}>
      <div className={estilos.topoDetalhes}>
        <AvatarIniciais id={linha.leadId} nome={linha.cliente} className={estilos.avatar} />
        <div className="min-w-0">
          <DialogTitle>{linha.cliente}</DialogTitle>
          <DialogDescription className="break-words">{linha.empresa ? linha.empresa + " · " + linha.id : linha.id}</DialogDescription>
        </div>
      </div>
      {podeAbrir && <Link href={"/atendimentos?atendimentoId=" + encodeURIComponent(linha.id)}
        className={buttonVariants({ variant: "outline", className: "justify-self-start" })}>{t.abrirAtendimento}<ArrowUpRight aria-hidden /></Link>}
      <dl className="grid grid-cols-2 gap-4 rounded-xl border p-4">
        {[
          [t.inicio, formatoData(linha.iniciadoEm)], [t.fim, formatoData(linha.finalizadoEm)],
          [t.duracao, formatarDuracao(linha.duracaoSegundos, t.semValor)], [t.status, t.statusRotulos[linha.status]],
          [t.etapa, linha.etapa ?? t.semEtapa], [t.responsavel, linha.atendente ?? t.semResponsavel],
          [t.csatNota, linha.csat === null ? t.semValor : numeros.format(linha.csat)],
        ].map(([chave, valor]) => <div key={chave}><dt className="text-muted-foreground">{chave}</dt><dd className="font-medium">{valor}</dd></div>)}
      </dl>
      <section className="space-y-3">
        <h3 className="font-semibold">{t.jornada}</h3>
        {jornada.isError && <ErroDeCarregamento mensagem={t.erroJornada} onTentarNovamente={() => jornada.refetch()} />}
        {jornada.isPending && <p role="status">{t.carregando}</p>}
        {!jornada.isError && !jornada.isPending && (eventos.length ? (
          <ol className={estilos.jornada}>{eventos.map((evento) => (
            <li key={evento.id}><p>{evento.descricao}</p><time dateTime={evento.criadoEm} className="text-xs text-muted-foreground">{formatoData(evento.criadoEm)}</time></li>
          ))}</ol>
        ) : <p className="text-sm text-muted-foreground">{t.semJornada}</p>)}
        {jornada.hasNextPage && <Button variant="outline" disabled={jornada.isFetchingNextPage}
          onClick={() => void jornada.fetchNextPage()}>{t.maisEventos}</Button>}
      </section>
      <DialogFooter><Button variant="outline" onClick={fechar}>{t.fechar}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
