"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Download, Hourglass, Star } from "lucide-react";

import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import { OpcoesListaV2 } from "@/components/shell/opcoes-lista-v2";
import moldura from "@/components/shell/lista-v2.module.css";
import { Button } from "@/components/ui/button";
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
const tempo = new Intl.NumberFormat("pt-BR", { style: "unit", unit: "minute", unitDisplay: "short", maximumFractionDigits: 1 });

export function PaginaRelatorioAtendimentos() {
  const { relatorios: t, menu } = useTextos();
  const podeExportar = useCapacidades().pode("relatorios.exportar");
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

  return (
    <section data-layout="v2" className={moldura.pagina + " " + moldura.modulo}>
      <CabecalhoListaV2 titulo={t.titulo} grupo={menu.grupoGestao} />
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
          <Indicador icone={ClipboardList} titulo={t.atendimentos} valor={numeros.format(resumo.total)} />
          <Indicador icone={CheckCircle2} titulo={t.finalizados} valor={numeros.format(resumo.finalizados)} />
          <Indicador icone={Hourglass} titulo={t.tma} valor={formatarDuracao(resumo.duracaoMediaSegundos, t.semValor)} />
          <Indicador icone={Star} titulo={t.csat} valor={resumo.csatMedio === null ? t.semValor : numeros.format(resumo.csatMedio)}
            legenda={t.avaliacoes.replace("{total}", numeros.format(resumo.avaliacoes))} />
        </div>
        <div className={estilos.graficos}>
          <Grafico titulo={t.status} grupos={dados.porStatus.map((grupo) => ({
            ...grupo, nome: t.statusRotulos[grupo.id as StatusRelatorio],
          }))} ativo={filtros.status} semNome={t.semValor} vazio={t.vazio} distribuicao
            selecionar={(status) => alterar({ status: status as StatusRelatorio | "" })} />
          <Grafico titulo={t.etapaAtual} grupos={dados.porEtapa} ativo={filtros.etapa} semNome={t.semEtapa} vazio={t.vazio}
            selecionar={(etapa) => alterar({ etapa })} />
          <Grafico titulo={t.porAtendente} grupos={dados.porAtendente} ativo={filtros.atendente} semNome={t.semResponsavel}
            vazio={t.vazio} csat={t.csat} selecionar={(atendente) => alterar({ atendente })} />
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
          <Input className="w-full sm:w-60" placeholder={t.busca} aria-label={t.busca} maxLength={150}
            value={buscaDigitada} onChange={(e) => setBuscaDigitada(e.target.value)} />
          <Seletor ariaLabel={t.etapa} valor={filtros.etapa} onChange={(etapa) => alterar({ etapa })}
            placeholder={t.todasEtapas} className="w-auto max-w-full" opcoes={opcoesDeGrupo(dados?.porEtapa)} />
          <Seletor ariaLabel={t.responsavel} valor={filtros.atendente} onChange={(atendente) => alterar({ atendente })}
            placeholder={t.todosAtendentes} className="w-auto max-w-full" opcoes={opcoesDeGrupo(dados?.porAtendente)} />
          <OpcoesListaV2 rotulo={t.status} valor={filtros.status} opcoes={opcoesStatus} onChange={(status) => alterar({ status })} />
          {(filtros.etapa || filtros.atendente || filtros.status || buscaDigitada) && <Button variant="ghost"
            onClick={() => { setBuscaDigitada(""); alterar({ etapa: "", atendente: "", status: "", busca: "" }); }}>{t.limpar}</Button>}
        </div>
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
                    <button type="button" className="text-left font-semibold hover:underline"
                      onClick={() => setSelecionada(linha)}>{linha.cliente}</button>
                    <p className="text-xs text-muted-foreground">{linha.empresa ?? linha.id}</p>
                  </th>
                  <td>{linha.atendente ?? t.semResponsavel}</td><td>{linha.etapa ?? t.semEtapa}</td>
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
      {selecionada && <Detalhes linha={selecionada} textos={t} formatoData={formatoData} fechar={() => setSelecionada(null)} />}
    </section>
  );
}

function opcoesDeGrupo(grupos?: GrupoRelatorio[]) {
  return (grupos ?? []).flatMap(({ id, nome }) => id && nome ? [{ valor: id, rotulo: nome }] : []);
}

function formatarDuracao(segundos: number | null, vazio: string) {
  return segundos === null ? vazio : tempo.format(segundos / 60);
}

function Indicador({ icone: Icone, titulo, valor, legenda }: {
  icone: typeof ClipboardList; titulo: string; valor: string; legenda?: string;
}) {
  return <section className={estilos.indicador}>
    <h2><Icone aria-hidden className="size-5" />{titulo}</h2>
    <strong>{valor}</strong>
    {legenda && <p className="text-xs text-muted-foreground">{legenda}</p>}
  </section>;
}

function Grafico({ titulo, grupos, ativo, semNome, vazio, csat, distribuicao, selecionar }: {
  titulo: string; grupos: GrupoRelatorio[]; ativo: string; semNome: string;
  vazio: string; csat?: string; distribuicao?: boolean; selecionar: (id: string) => void;
}) {
  const maior = Math.max(1, ...grupos.map((grupo) => grupo.total));
  return <section className={estilos.grafico}>
    <h2>{titulo}</h2>
    {distribuicao && grupos.length > 0 && <div aria-hidden className={estilos.distribuicao}>
      {grupos.map(({ id, total }) => <span key={id} data-status={id} style={{ flexGrow: total }} />)}
    </div>}
    {grupos.length ? <ul>{grupos.map(({ id, nome, total, csatMedio }) => {
      const conteudo = <>
        <span className="truncate">{nome ?? semNome}</span>
        <span aria-hidden className={estilos.trilho}><span style={{ width: (total / maior * 100) + "%" }} /></span>
        <strong>{numeros.format(total)}</strong>
        {csat && csatMedio !== null && <span title={csat} className="flex items-center gap-1"><Star aria-hidden className="size-3" />{numeros.format(csatMedio)}</span>}
      </>;
      return <li key={id ?? "sem-grupo"}>{id
        ? <button type="button" className={estilos.barra} aria-pressed={ativo === id}
            onClick={() => selecionar(ativo === id ? "" : id)}>{conteudo}</button>
        : <div className={estilos.barra}>{conteudo}</div>}</li>;
    })}</ul> : <p className="mt-3 text-sm text-muted-foreground">{vazio}</p>}
  </section>;
}

function Detalhes({ linha, textos: t, formatoData, fechar }: {
  linha: LinhaRelatorio; textos: Textos["relatorios"]; formatoData: (v: string | null) => string; fechar: () => void;
}) {
  const jornada = useTimelineDoLead(linha.leadId);
  const eventos = jornada.data?.pages.flatMap((p) => p.eventos).filter((evento) => evento.tipo === "ETAPA_ALTERADA") ?? [];
  return <Dialog open onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
    <DialogContent className={estilos.detalhes} showCloseButton={false}>
      <DialogTitle>{linha.cliente}</DialogTitle>
      <DialogDescription>{linha.empresa ? linha.empresa + " · " + linha.id : linha.id}</DialogDescription>
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
          <ol className="space-y-2 border-l pl-3">{eventos.map((evento) => (
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
