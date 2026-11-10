"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Columns3, Download, List, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { PainelLateralLead } from "@/components/leads/painel-lateral-lead";
import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import listaV2 from "@/components/shell/lista-v2.module.css";
import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";
import { useEquipe } from "@/lib/equipe/use-equipe";
import { useTextos } from "@/lib/config/textos-provider";
import { useCanais, useEtapas } from "@/lib/lead/use-painel-lead";
import {
  useCamposFiltraveis,
  useCatalogosDeFiltro,
  useContagemDeLeads,
  criterioDosFiltrosAtivos,
  useLeadsDaAgenda,
  SEM_RESPONSAVEL,
} from "@/lib/agenda/use-agenda";
import {
  FILTROS_RAPIDOS_VAZIOS,
  type FiltroAtivo,
  type FiltrosRapidosAgenda,
  type LeadDaAgenda,
} from "@/lib/agenda/types";
import { abrirAtendimentoParaLead } from "@/lib/atendimento/api";
import {
  destinoDaAberturaDeAtendimento,
  registrarDiagnosticoDeAbertura,
  statusHttpDoErro,
} from "@/lib/atendimento/abertura-atendimento";
import { exportarLeadsCsv } from "@/lib/agenda/api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useCapacidades } from "@/lib/gestao/use-capacidades";
import { gerenciaImportacaoDeLeads } from "@/lib/navegacao/visibilidade-do-menu";

import { BarraDeFiltros } from "./barra-de-filtros";
import { ListaDeLeadsMobile } from "./lista-de-leads-mobile";
import { TabelaDeLeads } from "./tabela-de-leads";
import { useBuscaLeadsParaEntrada } from "@/lib/agenda/use-busca-entrada";
import { apiFetch } from "@/lib/api/http-client";
import { useTelaEstreita } from "@/lib/navegacao/tela-estreita";
import { cn } from "@/lib/utils";
import { DialogoImportacaoLeads } from "./dialogo-importacao-leads";
import estilos from "./agenda-v2.module.css";

/**
 * Agenda como tabela sobre o filtro modular (E16 §Bloco 1) — substitui a lista de cards que
 * reaproveitava `CartaoConversa` e só mostrava atendimentos abertos. Toda linha vem de {@code
 * POST /api/v1/leads/filtrar}, já recortada por RN-CRM-01; nenhum dado é mockado.
 *
 * <p>Kanban fica de fora de propósito. Importação e exportação CSV ficam disponíveis apenas para
 * gestão e usam endpoints próprios, sempre com o mesmo recorte de visibilidade da Agenda.
 */
export function PaginaAgenda() {
  const textosGerais = useTextos();
  const t = textosGerais.agenda;
  const layoutV2 = useFuncionalidadesHabilitadas().data?.includes("agenda_layout_v2") ?? false;
  const entrada = t.entrada ?? {
    placeholder: t.filtros.titulo,
    pedir: t.filtros.adicionar,
    responsavel: `${t.semResponsavel}: {nome}`,
  };
  const router = useRouter();
  const papel = useAuthStore((estado) => estado.papel);
  const usuarioId = useAuthStore((estado) => estado.usuarioId);
  const podeGerenciar = gerenciaImportacaoDeLeads(papel);
  const capacidades = useCapacidades();
  const podeAbrirAtendimento = capacidades.pode("atendimentos.abrir_para_contato");
  const podeColaborar = capacidades.pode("atendimentos.colaborar");

  const [filtrosAtivos, setFiltrosAtivos] = useState<FiltroAtivo[]>([]);
  const [filtrosRapidos, setFiltrosRapidos] = useState<FiltrosRapidosAgenda>({
    ...FILTROS_RAPIDOS_VAZIOS,
  });
  const [pagina, setPagina] = useState(0);
  const [leadNoPainel, setLeadNoPainel] = useState<LeadDaAgenda | null>(null);
  const [buscaEntrada, setBuscaEntrada] = useState("");
  const [filtrosMobileAbertos, setFiltrosMobileAbertos] = useState(false);
  const [importacaoAberta, setImportacaoAberta] = useState(false);
  const [kanban, setKanban] = useState(false);
  const telaEstreita = useTelaEstreita();
  const buscaColega = useBuscaLeadsParaEntrada(buscaEntrada);
  const [pedidoEmAndamento, setPedidoEmAndamento] = useState<string | null>(null);
  const aberturaEmAndamento = useRef<string | null>(null);
  async function pedirEntrada(id: string) {
    setPedidoEmAndamento(id);
    try {
      await apiFetch(`/api/v1/atendimentos/pedir-entrada?leadId=${encodeURIComponent(id)}`, {
        method: "POST",
      });
    } finally {
      setPedidoEmAndamento(null);
    }
  }

  const abrirAtendimento = useMutation({
    mutationFn: (leadId: string) => abrirAtendimentoParaLead(leadId),
    onSuccess: (resposta) => {
      registrarDiagnosticoDeAbertura({
        origem: "agenda",
        etapa: "confirmada",
        leadId: resposta.leadId,
        atendimentoId: resposta.atendimentoId,
        usuarioId,
        papel,
        filtrosAtivos: filtrosAtivos.length,
        httpStatus: 200,
      });
      setLeadNoPainel(null);
      router.push(destinoDaAberturaDeAtendimento(resposta));
    },
    onError: (erro, leadId) => {
      registrarDiagnosticoDeAbertura({
        origem: "agenda",
        etapa: "falhou",
        leadId,
        usuarioId,
        papel,
        filtrosAtivos: filtrosAtivos.length,
        httpStatus: statusHttpDoErro(erro),
      });
    },
    onSettled: () => {
      aberturaEmAndamento.current = null;
    },
  });

  const campos = useCamposFiltraveis();
  const etapas = useEtapas();
  const canais = useCanais();
  const catalogos = useCatalogosDeFiltro();
  const equipe = useEquipe();
  const tagsDisponiveis = catalogos.data?.tags ?? [];
  const criterio = criterioDosFiltrosAtivos(filtrosRapidos, filtrosAtivos, tagsDisponiveis);
  const exportacao = useMutation({
    mutationFn: () => exportarLeadsCsv(criterio),
    onSuccess: (arquivo) => {
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement("a");
      link.href = url;
      link.download = t.exportacao.arquivo;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
  const paginaDeLeads = useLeadsDaAgenda(
    filtrosRapidos,
    filtrosAtivos,
    tagsDisponiveis,
    pagina,
  );
  const contagem = useContagemDeLeads(
    filtrosRapidos,
    filtrosAtivos,
    tagsDisponiveis,
  );

  function adicionarFiltro(filtro: FiltroAtivo) {
    setFiltrosAtivos((atuais) => [...atuais, filtro]);
    setPagina(0);
  }

  function removerFiltro(id: string) {
    setFiltrosAtivos((atuais) => atuais.filter((filtro) => filtro.id !== id));
    setPagina(0);
  }

  function atualizarFiltrosRapidos(novosFiltros: FiltrosRapidosAgenda) {
    setFiltrosRapidos(novosFiltros);
    setPagina(0);
  }

  function limparFiltros() {
    setFiltrosAtivos([]);
    setFiltrosRapidos({ ...FILTROS_RAPIDOS_VAZIOS });
    setPagina(0);
  }

  function abrirFicha(lead: LeadDaAgenda) {
    abrirAtendimento.reset();
    // Guarda o snapshot retornado pela Agenda. O item pode sair da página após um refetch,
    // mas o painel e a abertura continuam ancorados no mesmo lead autorizado.
    setLeadNoPainel(lead);
  }

  function solicitarAbrirAtendimento(lead: LeadDaAgenda) {
    if (abrirAtendimento.isPending || aberturaEmAndamento.current != null) return;
    aberturaEmAndamento.current = lead.id;
    registrarDiagnosticoDeAbertura({
      origem: "agenda",
      etapa: "solicitada",
      leadId: lead.id,
      usuarioId,
      papel,
      filtrosAtivos: filtrosAtivos.length,
    });
    abrirAtendimento.mutate(lead.id);
  }

  const leads = paginaDeLeads.data?.leads ?? [];
  const totalExibido = contagem.data ?? leads.length;
  const textoContador = t.contador
    .replace("{exibindo}", String(leads.length))
    .replace("{total}", String(totalExibido));
  const erroAbrir =
    abrirAtendimento.isError
      ? abrirAtendimento.error instanceof Error
        ? abrirAtendimento.error.message
        : t.erroAbrirAtendimento
      : null;

  return (
    <div data-layout={layoutV2 ? "v2" : "legado"}
      className={layoutV2 ? cn(listaV2.pagina, estilos.pagina) : "flex h-full flex-col overflow-hidden bg-background p-6 max-sm:p-4"}>
      {layoutV2 && <CabecalhoListaV2 titulo={t.titulo} />}
      <header className={cn(
        "flex-none",
        telaEstreita
          ? "mb-3 flex items-center justify-between gap-3"
          : "-mx-6 -mt-6 mb-4 border-b border-border bg-card px-6 py-4",
      )}>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground max-sm:text-[1.375rem]">{t.titulo}</h1>
          {!telaEstreita && <p className="mt-1 text-sm text-muted-foreground">{t.descricao}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {podeGerenciar && t.importacao && (
            <>
              <Button
                type="button"
                variant="outline"
                size={telaEstreita ? "icon" : "sm"}
                aria-label={t.importarCsv}
                title={t.importarCsv}
                onClick={() => setImportacaoAberta(true)}
              >
                <Upload aria-hidden="true" />
                {!telaEstreita && t.importarCsv}
              </Button>
              <Button
                type="button"
                variant="outline"
                size={telaEstreita ? "icon" : "sm"}
                aria-label={t.exportarCsv}
                title={t.exportarCsv}
                disabled={exportacao.isPending}
                onClick={() => exportacao.mutate()}
              >
                <Download aria-hidden="true" />
                {!telaEstreita && t.exportarCsv}
              </Button>
            </>
          )}
          {telaEstreita && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              aria-pressed={filtrosMobileAbertos}
              onClick={() => setFiltrosMobileAbertos((abertos) => !abertos)}
            >
              {t.filtros.titulo}
            </Button>
          )}
          {layoutV2 && (
            <div className={estilos.escopos}>
              <button type="button" aria-pressed={!kanban} onClick={() => setKanban(false)}>
                <List aria-hidden className="size-4" />{t.v2.lista}
              </button>
              <button type="button" aria-pressed={kanban} onClick={() => setKanban(true)}>
                <Columns3 aria-hidden className="size-4" />{t.v2.kanban}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-none">
        {!telaEstreita && podeColaborar && (
          <div className="mb-3 flex items-center gap-2">
            <Input value={buscaEntrada} onChange={(evento) => setBuscaEntrada(evento.target.value)} placeholder={entrada.placeholder} aria-label={entrada.placeholder} />
            {buscaColega.data?.map((lead) => <div key={lead.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"><span>{lead.nome}{lead.empresa ? ` · ${lead.empresa}` : ""}</span><span className="text-muted-foreground">{entrada.responsavel.replace("{nome}", lead.responsavelNome)}</span><Button size="sm" variant="outline" onClick={() => pedirEntrada(lead.id)} disabled={pedidoEmAndamento === lead.id}>{entrada.pedir}</Button></div>)}
          </div>
        )}
        {(!telaEstreita || filtrosMobileAbertos) && (
          <BarraDeFiltros
            campos={campos.data ?? []}
            carregandoCampos={campos.isLoading}
            erroCampos={campos.isError}
            onTentarCamposNovamente={() => campos.refetch()}
            filtrosAtivos={filtrosAtivos}
            filtrosRapidos={filtrosRapidos}
            cidades={catalogos.data?.cidades ?? []}
            referencias={{
              etapas: etapas.data ?? [],
              canais: canais.data ?? [],
              equipe: equipe.data ?? [],
              tags: tagsDisponiveis,
            }}
            textos={t.filtros}
            textosStatus={t.status}
            textoSemResponsavel={t.semResponsavel}
            atalhos={layoutV2 && (
              <div className={estilos.escopos}>
                {[
                  { id: null, rotulo: t.v2.todos },
                  ...(usuarioId ? [{ id: usuarioId, rotulo: t.v2.meus }] : []),
                  { id: SEM_RESPONSAVEL, rotulo: t.semResponsavel },
                ].map(({ id, rotulo }) => {
                  const valores = filtrosRapidos.atendentes;
                  const ativo = id ? valores.length === 1 && valores[0] === id : valores.length === 0;
                  return <button type="button" key={rotulo} aria-pressed={ativo}
                    onClick={() => atualizarFiltrosRapidos({ ...filtrosRapidos, atendentes: id ? [id] : [] })}>{rotulo}</button>;
                })}
              </div>
            )}
            contador={
              <p className="text-sm whitespace-nowrap text-muted-foreground">
                {textoContador}
              </p>
            }
            onAdicionar={adicionarFiltro}
            onFiltrosRapidosChange={atualizarFiltrosRapidos}
            onRemover={removerFiltro}
            onLimparTudo={limparFiltros}
          />
        )}
        {telaEstreita && !filtrosMobileAbertos && (
          <div className="mb-3">
            <Input
              value={filtrosRapidos.busca}
              onChange={(evento) => atualizarFiltrosRapidos({ ...filtrosRapidos, busca: evento.target.value })}
              placeholder={t.filtros.buscaPlaceholder}
              aria-label={t.filtros.busca}
            />
            <p className="mt-2 text-sm text-muted-foreground">{textoContador}</p>
          </div>
        )}
        {layoutV2 && !!etapas.data?.length && (
          <div className={estilos.etapas} role="group" aria-label={t.filtros.etapa}>
            <button type="button" aria-pressed={filtrosRapidos.etapas.length === 0}
              onClick={() => atualizarFiltrosRapidos({ ...filtrosRapidos, etapas: [] })}>
              {t.v2.todasEtapas}
            </button>
            {etapas.data.map((etapa) => (
              <button type="button" key={etapa.id} aria-pressed={filtrosRapidos.etapas.includes(etapa.id)}
                style={{ "--tom-etapa": etapa.corVisual ?? "var(--v2-azul)" } as React.CSSProperties}
                onClick={() => atualizarFiltrosRapidos({
                  ...filtrosRapidos,
                  etapas: filtrosRapidos.etapas.includes(etapa.id)
                    ? filtrosRapidos.etapas.filter((id) => id !== etapa.id)
                    : [...filtrosRapidos.etapas, etapa.id],
                })}>
                {etapa.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto", layoutV2 && estilos.resultados)}>
        {paginaDeLeads.isLoading ? (
          <p className="text-sm text-muted-foreground">{t.carregando}</p>
        ) : paginaDeLeads.isError ? (
          <ErroDeCarregamento
            mensagem={t.erro}
            onTentarNovamente={() => paginaDeLeads.refetch()}
          />
        ) : leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.vazia}</p>
        ) : layoutV2 && kanban ? (
          <div className={estilos.kanban}>
            {[
              ...(etapas.data ?? []),
              { id: null, nome: t.v2.semEtapa, corVisual: null },
            ].filter(({ id }) => id === null || !filtrosRapidos.etapas.length || filtrosRapidos.etapas.includes(id))
              .map((etapa) => {
                const contatos = leads.filter((lead) => etapa.id === null
                  ? !etapas.data?.some(({ id }) => id === lead.etapaAtendimentoId)
                  : lead.etapaAtendimentoId === etapa.id);
                if (etapa.id === null && !contatos.length) return null;
                return (
                  <section key={etapa.id} style={{ "--tom-etapa": etapa.corVisual ?? "var(--v2-azul)" } as React.CSSProperties}>
                    <h2>{etapa.nome} <span>{contatos.length}</span></h2>
                    {contatos.length ? (
                      <ListaDeLeadsMobile leads={contatos} etapas={etapas.data ?? []} equipe={equipe.data ?? []}
                        textos={t} onAbrirFicha={abrirFicha} />
                    ) : <p>{t.vazia}</p>}
                  </section>
                );
              })}
          </div>
        ) : telaEstreita ? (
          <ListaDeLeadsMobile
            leads={leads}
            etapas={etapas.data ?? []}
            equipe={equipe.data ?? []}
            textos={t}
            onAbrirFicha={abrirFicha}
          />
        ) : (
          <TabelaDeLeads
            layoutV2={layoutV2}
            leads={leads}
            etapas={etapas.data ?? []}
            equipe={equipe.data ?? []}
            textos={t}
            onAbrirFicha={abrirFicha}
            onAbrirAtendimento={podeAbrirAtendimento ? solicitarAbrirAtendimento : undefined}
            abrindoLeadId={abrirAtendimento.isPending ? (abrirAtendimento.variables ?? null) : null}
          />
        )}
      </div>

      <div className={cn("mt-3 flex flex-none justify-end gap-2", layoutV2 && estilos.paginacao)}>
        {layoutV2 && <span>{textoContador}</span>}
        <Button
          type="button"
          variant="outline"
          disabled={pagina === 0}
          aria-label={layoutV2 ? t.paginacao.anterior : undefined}
          onClick={() => setPagina((atual) => atual - 1)}
        >
          {layoutV2 ? <ChevronLeft aria-hidden /> : t.paginacao.anterior}
        </Button>
        {layoutV2 && <span className={estilos.numeroPagina}>{pagina + 1}</span>}
        <Button
          type="button"
          variant="outline"
          disabled={!paginaDeLeads.data?.temMais}
          aria-label={layoutV2 ? t.paginacao.proxima : undefined}
          onClick={() => setPagina((atual) => atual + 1)}
        >
          {layoutV2 ? <ChevronRight aria-hidden /> : t.paginacao.proxima}
        </Button>
      </div>

      {leadNoPainel && (
        <PainelLateralLead
          leadId={leadNoPainel.id}
          contexto="agenda"
          onFechar={() => {
            if (abrirAtendimento.isPending) return;
            setLeadNoPainel(null);
            abrirAtendimento.reset();
          }}
          onAbrirAtendimento={podeAbrirAtendimento
            ? () => {
                solicitarAbrirAtendimento(leadNoPainel);
              }
            : undefined}
          abrindoAtendimento={abrirAtendimento.isPending}
          erroAbrirAtendimento={erroAbrir}
        />
      )}
      {podeGerenciar && t.importacao && (
        <DialogoImportacaoLeads
          aberto={importacaoAberta}
          onAbertoChange={setImportacaoAberta}
          textos={t.importacao}
        />
      )}
    </div>
  );
}
