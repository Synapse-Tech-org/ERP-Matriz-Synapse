"use client";

import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import { OpcoesListaV2 } from "@/components/shell/opcoes-lista-v2";
import visual from "@/components/shell/agenda-recursos-v2.module.css";
import estilos from "./templates-v2.module.css";
import listaV2 from "@/components/shell/lista-v2.module.css";
import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Copy, Hourglass, LayoutTemplate, MessageSquareCheck, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { PillDeStatus } from "@/components/ui/pill-de-status";
import type { TomDePill } from "@/components/ui/pill-de-status";
import { Seletor } from "@/components/ui/seletor";
import { Textarea } from "@/components/ui/textarea";
import {
  criarTemplateWhatsApp,
  editarTemplateWhatsApp,
  excluirTemplateWhatsApp,
  listarTemplatesWhatsApp,
  obterCapacidadeDoCanal,
} from "@/lib/atendimento/api";
import {
  analisarVariaveisDoCorpo,
  interpolarCatalogo,
  rotulosDasVariaveis,
} from "@/lib/atendimento/variaveis-do-template";
import type {
  CategoriaTemplateWhatsApp,
  StatusTemplateWhatsApp,
  TemplateWhatsApp,
} from "@/lib/atendimento/types";
import { mensagemDeErroDeTemplate } from "@/lib/atendimento/erro-de-template";
import { useTextos } from "@/lib/config/textos-provider";
import { useCapacidades } from "@/lib/gestao/use-capacidades";
import {
  DialogoConfirmacaoExclusaoTemplate,
  FormularioEdicaoTemplate,
} from "./acoes-template-whatsapp";

const TOM_DO_STATUS: Record<StatusTemplateWhatsApp, TomDePill> = {
  APROVADO: "sucesso",
  PENDENTE: "atencao",
  REJEITADO: "erro",
  PAUSADO: "neutro",
  DESCONHECIDO: "neutro",
};

const ORDEM_DAS_CATEGORIAS: CategoriaTemplateWhatsApp[] = [
  "UTILIDADE",
  "MARKETING",
  "AUTENTICACAO",
];

export function PaginaTemplatesWhatsApp() {
  const layoutV2 = useFuncionalidadesHabilitadas().data?.includes("recursos_layout_v2") ?? false;
  const textos = useTextos();
  const t = textos.templatesWhatsApp;
  const capacidades = useCapacidades();
  const cache = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [modeloInicial, setModeloInicial] = useState<TemplateWhatsApp | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusTemplateWhatsApp | "">("");
  const [categoria, setCategoria] = useState<CategoriaTemplateWhatsApp | "">("");
  const [editando, setEditando] = useState<TemplateWhatsApp | null>(null);
  const [excluindo, setExcluindo] = useState<TemplateWhatsApp | null>(null);

  const capacidade = useQuery({
    queryKey: ["capacidade-do-canal"],
    queryFn: obterCapacidadeDoCanal,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const consulta = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: listarTemplatesWhatsApp,
    retry: 1,
  });
  const criar = useMutation({
    mutationFn: criarTemplateWhatsApp,
    onSuccess: (criado) => {
      void cache.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      setAberto(false);
      if (criado.status !== "APROVADO") {
        setAviso(t.avisoPendente);
      }
    },
  });
  const editarTemplate = useMutation({
    mutationFn: (pedido: { id: string; corpo: string }) => editarTemplateWhatsApp(pedido.id, { corpo: pedido.corpo }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      setEditando(null);
    },
  });
  const excluirTemplate = useMutation({
    mutationFn: (template: TemplateWhatsApp) => excluirTemplateWhatsApp(template.id, template.nome),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      void cache.invalidateQueries({ queryKey: ["campanhas", "templates"] });
      setExcluindo(null);
    },
  });

  if (capacidade.isPending) {
    return <p className="p-6">{t.carregando}</p>;
  }
  if (capacidade.data && !capacidade.data.gerenciaTemplates) {
    return null;
  }
  const podeCriar = capacidades.pode("templates.criar");
  const podeEditar = capacidades.pode("templates.editar");
  const podeExcluir = capacidades.pode("templates.excluir");

  const todos = consulta.data ?? [];
  const pesquisados = filtrarTemplates(todos, busca, t.categorias, t.status);
  const porCategoria = layoutV2 && categoria ? pesquisados.filter((item) => item.categoria === categoria) : pesquisados;
  const filtrados = layoutV2 && status ? porCategoria.filter((item) => item.status === status) : porCategoria;
  function abrirFormulario(modelo: TemplateWhatsApp | null) {
    if (criar.isPending) return;
    criar.reset();
    setModeloInicial(modelo);
    setAberto(true);
  }

  const buscaLocal = (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder={t.busca}
        className="w-64 max-w-full rounded-xl bg-card pl-9" aria-label={t.busca} />
    </div>
  );
  const grupos = agruparPorCategoria(filtrados);

  return (
    <div data-layout={layoutV2 ? "v2" : "legado"} className={layoutV2 ? `${listaV2.pagina} ${listaV2.modulo} ${visual.paleta}` : "space-y-5 p-6"}>
      {layoutV2 && <CabecalhoListaV2 titulo={t.titulo} grupo={textos.menu.grupoRecursos} busca={textos.gestao?.v2?.buscaGlobal} />}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t.titulo}</h1>
          <p className="text-sm text-muted-foreground">{t.descricao}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!layoutV2 && todos.length > 1 && buscaLocal}
          {podeCriar && (
            <Button
              data-slot="lista-v2-acao"
              onClick={() => abrirFormulario(null)}
            >
              {layoutV2 && <Plus aria-hidden className="size-4" />}
              {t.novo}
            </Button>
          )}
        </div>
      </header>

      <div className={layoutV2 ? estilos.layout : "space-y-4"}>
        {layoutV2 && (
          <aside className={estilos.lateral} aria-label={t.formulario.categoria}>
            <p className="px-3 py-2 text-xs font-medium text-muted-foreground">{t.formulario.categoria}</p>
            <button type="button" aria-pressed={!categoria} onClick={() => setCategoria("")}>
              {t.v2.todasCategorias}<span>{pesquisados.length}</span>
            </button>
            {ORDEM_DAS_CATEGORIAS.map((valor) => (
              <button key={valor} type="button" aria-pressed={categoria === valor} onClick={() => setCategoria(valor)}>
                {t.categorias[valor]}<span>{pesquisados.filter((item) => item.categoria === valor).length}</span>
              </button>
            ))}
          </aside>
        )}
        <div className={estilos.conteudo}>
          {layoutV2 ? (
            <>
              <div className={estilos.guia}>
                {[
                  { Icone: Pencil, titulo: t.v2.criar, descricao: t.formulario.corpoAjuda },
                  { Icone: Hourglass, titulo: t.v2.analisar, descricao: t.v2.analisarDescricao },
                  { Icone: MessageSquareCheck, titulo: t.v2.usar, descricao: t.v2.usarDescricao },
                ].map(({ Icone, titulo, descricao }) => (
                  <div key={titulo}><Icone aria-hidden /><span><strong className="text-sm">{titulo}</strong>
                    <span className="block text-xs text-muted-foreground">{descricao}</span></span></div>
                ))}
              </div>
              <div className={estilos.filtros}>
                <OpcoesListaV2<StatusTemplateWhatsApp | ""> rotulo={t.v2.estado} valor={status} onChange={setStatus}
                  opcoes={[
                    { valor: "", rotulo: t.v2.todos, total: porCategoria.length },
                    ...(Object.keys(TOM_DO_STATUS) as StatusTemplateWhatsApp[])
                      .filter((valor) => valor !== "PAUSADO" && valor !== "DESCONHECIDO" || porCategoria.some((item) => item.status === valor) || status === valor)
                      .map((valor) => ({ valor, rotulo: t.status[valor], total: porCategoria.filter((item) => item.status === valor).length })),
                  ]} />
                {buscaLocal}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
              <LayoutTemplate className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">{t.dica}</p>
            </div>
          )}

          {aviso && (
            <p className="rounded-lg border border-cor-atencao/40 bg-cor-atencao/10 px-3 py-2 text-sm text-cor-atencao">
              {aviso}
            </p>
          )}

          {consulta.isLoading ? (
            <p>{t.carregando}</p>
          ) : consulta.isError ? (
            <ErroDeCarregamento
              mensagem={t.erro}
              onTentarNovamente={() => consulta.refetch()}
            />
          ) : !todos.length ? (
            <p className={layoutV2 ? estilos.vazio : "text-muted-foreground"}>{t.vazio}</p>
          ) : filtrados.length === 0 ? (
            <p className={layoutV2 ? estilos.vazio : "text-muted-foreground"}>{t.semResultados}</p>
          ) : (
            <div className="space-y-6">
              {grupos.map((grupo) => (
                <section key={grupo.categoria} className="space-y-2">
                  {(layoutV2 || grupos.length > 1) && (
                    <p className={layoutV2 ? "px-1 text-sm font-semibold" : "px-0.5 text-xs font-bold tracking-wide text-muted-foreground uppercase"}>
                      {t.categorias[grupo.categoria]} · {grupo.itens.length}
                    </p>
                  )}
                  <ul className={layoutV2 ? estilos.grade : "space-y-2"}>
                    {grupo.itens.map((template) => (
                      <li
                            key={`${template.nome}:${template.idioma}`}
                        className={layoutV2 ? estilos.cartao : "rounded-xl border border-border bg-card p-4 shadow-sm"}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className={layoutV2 ? "break-all font-mono text-sm font-medium" : "font-semibold"}>{template.nome}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{template.idioma}{layoutV2 && " · " + t.v2.variaveis.replace("{total}", String(template.quantidadeDeParametros))}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {!layoutV2 && grupos.length === 1 && (
                              <PillDeStatus tom="neutro">{t.categorias[template.categoria]}</PillDeStatus>
                            )}
                            <PillDeStatus tom={TOM_DO_STATUS[template.status]}>
                              {t.status[template.status]}
                            </PillDeStatus>
                          </div>
                        </div>
                        {layoutV2 ? <PreviaMensagem corpo={template.corpo} /> : (
                          <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{template.corpo}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {podeEditar && template.id && (
                              <Button
                                type="button"
                                variant="outline"
                                size={layoutV2 ? "sm" : "icon"}
                                aria-label={`${t.editar}: ${template.nome}`}
                                title={t.editar}
                                onClick={() => {
                                  if (!editarTemplate.isPending) editarTemplate.reset();
                                  setEditando(template);
                                }}
                              >
                                <Pencil className="size-(--tamanho-icone-interface)" aria-hidden />
                                {layoutV2 && t.editar}
                              </Button>
                            )}
                            {layoutV2 && podeCriar && template.categoria !== "AUTENTICACAO" && (
                              <Button type="button" size="sm" variant="outline" aria-label={t.v2.duplicar + ": " + template.nome}
                                onClick={() => abrirFormulario(template)}><Copy aria-hidden className="size-4" />{t.v2.duplicar}</Button>
                            )}
                            {podeExcluir && template.id && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={`${t.excluir}: ${template.nome}`}
                                title={t.excluir}
                                onClick={() => {
                                  if (!excluirTemplate.isPending) excluirTemplate.reset();
                                  setExcluindo(template);
                                }}
                              >
                                <Trash2 className="size-(--tamanho-icone-interface)" aria-hidden />
                              </Button>
                            )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
        </div>
          )}

        </div>
      </div>

      {aberto && podeCriar && <FormularioTemplate
        modelo={modeloInicial}
        layoutV2={layoutV2}
        aberto
        salvando={criar.isPending}
        erro={criar.isError ? mensagemDeErroDeTemplate(criar.error, t.erros) : null}
        textos={t}
        onFechar={() => setAberto(false)}
        onSalvar={(pedido) => criar.mutate(pedido)}
      />}
      <FormularioEdicaoTemplate
        key={editando?.id ?? "sem-template"}
        template={podeEditar ? editando : null}
        salvando={editarTemplate.isPending}
        erro={editarTemplate.isError ? mensagemDeErroDeTemplate(editarTemplate.error, t.erros) : null}
        textos={t}
        onFechar={() => setEditando(null)}
        onSalvar={(corpo) => editando && editarTemplate.mutate({ id: editando.id, corpo })}
      />
      <DialogoConfirmacaoExclusaoTemplate
        template={podeExcluir ? excluindo : null}
        excluindo={excluirTemplate.isPending}
        erro={excluirTemplate.isError ? mensagemDeErroDeTemplate(excluirTemplate.error, t.erros) : null}
        textos={t}
        onFechar={() => setExcluindo(null)}
        onConfirmar={() => excluindo && excluirTemplate.mutate(excluindo)}
      />
    </div>
  );
}

function filtrarTemplates(
  templates: TemplateWhatsApp[],
  busca: string,
  categorias: ReturnType<typeof useTextos>["templatesWhatsApp"]["categorias"],
  status: ReturnType<typeof useTextos>["templatesWhatsApp"]["status"],
): TemplateWhatsApp[] {
  const termo = busca.trim().toLowerCase();
  if (!termo) {
    return templates;
  }
  return templates.filter((template) => {
    return (
      template.nome.toLowerCase().includes(termo)
      || template.corpo.toLowerCase().includes(termo)
      || template.idioma.toLowerCase().includes(termo)
      || categorias[template.categoria].toLowerCase().includes(termo)
      || status[template.status].toLowerCase().includes(termo)
    );
  });
}

function agruparPorCategoria(
  templates: TemplateWhatsApp[],
): { categoria: CategoriaTemplateWhatsApp; itens: TemplateWhatsApp[] }[] {
  const porCategoria = new Map<CategoriaTemplateWhatsApp, TemplateWhatsApp[]>();
  for (const template of templates) {
    const itens = porCategoria.get(template.categoria) ?? [];
    itens.push(template);
    porCategoria.set(template.categoria, itens);
  }
  return ORDEM_DAS_CATEGORIAS.filter((categoria) => porCategoria.has(categoria)).map(
    (categoria) => ({ categoria, itens: porCategoria.get(categoria) ?? [] }),
  );
}

function PreviaMensagem({ corpo }: { corpo: string }) {
  return <div className={estilos.previa}><p className={estilos.balao}>
    {corpo.split(/(\{\{\d+\}\})/).map((parte, indice) => parte.startsWith("{{")
      ? <code key={indice}>{parte}</code> : parte)}
  </p></div>;
}

function FormularioTemplate({
  modelo,
  layoutV2,
  aberto,
  salvando,
  erro,
  textos,
  onFechar,
  onSalvar,
}: {
  modelo: TemplateWhatsApp | null;
  layoutV2: boolean;
  aberto: boolean;
  salvando: boolean;
  erro: string | null;
  textos: ReturnType<typeof useTextos>["templatesWhatsApp"];
  onFechar: () => void;
  onSalvar: (pedido: {
    nome: string;
    idioma: string;
    categoria: CategoriaTemplateWhatsApp;
    corpo: string;
  }) => void;
}) {
  const [nome, setNome] = useState(modelo ? modelo.nome + "_copia" : "");
  const [idioma, setIdioma] = useState(modelo?.idioma ?? "pt_BR");
  const [categoria, setCategoria] = useState<CategoriaTemplateWhatsApp>(modelo?.categoria ?? "UTILIDADE");
  const [corpo, setCorpo] = useState(modelo?.corpo ?? "");
  const analise = analisarVariaveisDoCorpo(corpo);
  const ajudaDasVariaveis = analise.erro
    ? interpolarCatalogo(
        analise.erro.tipo === "ausente"
          ? textos.formulario.variavelAusente
          : textos.formulario.variavelInvalida,
        { marcador: `{{${analise.erro.indice}}}` },
      )
    : analise.indices.length > 0
      ? interpolarCatalogo(textos.formulario.variaveisDetectadas, {
          lista: rotulosDasVariaveis(analise.indices),
        })
      : null;

  return (
    // Com o POST em voo o formulário não fecha: reabrir "Novo" criaria um segundo template.
    <Dialog open={aberto} onOpenChange={(abertoAgora) => !abertoAgora && !salvando && onFechar()}>
      <DialogContent showCloseButton={!salvando} className={layoutV2 ? "max-h-[90dvh] overflow-y-auto sm:max-w-4xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{modelo ? textos.v2.duplicar : textos.formulario.criarTitulo}</DialogTitle>
          {layoutV2 && <DialogDescription>{textos.avisoPendente}</DialogDescription>}
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (analise.erro) {
              return;
            }
            onSalvar({ nome, idioma, categoria, corpo });
          }}
        >
          <div className={layoutV2 ? "grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : undefined}>
          <div className="space-y-3">
          <div>
            <label className="block text-sm" htmlFor="template-whatsapp-nome">
              {textos.formulario.nome}
            </label>
            <Input
              id="template-whatsapp-nome"
              className="mt-1"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              aria-label={textos.formulario.nome}
              aria-describedby="template-whatsapp-nome-ajuda"
              required
            />
            <span id="template-whatsapp-nome-ajuda" className="mt-1 block text-xs text-muted-foreground">
              {textos.formulario.nomeAjuda}
            </span>
          </div>
          <label className="block text-sm">
            {textos.formulario.idioma}
            <Input
              className="mt-1"
              value={idioma}
              onChange={(evento) => setIdioma(evento.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            {textos.formulario.categoria}
            <Seletor
              className="mt-1"
              valor={categoria}
              placeholder={textos.formulario.categoria}
              opcoes={[
                { valor: "UTILIDADE", rotulo: textos.categorias.UTILIDADE },
                { valor: "MARKETING", rotulo: textos.categorias.MARKETING },
              ]}
              onChange={(valor) => setCategoria(valor as CategoriaTemplateWhatsApp)}
            />
          </label>
          <div>
            <label className="block text-sm" htmlFor="template-whatsapp-corpo">
              {textos.formulario.corpo}
            </label>
            <Textarea
              id="template-whatsapp-corpo"
              className="mt-1"
              value={corpo}
              maxLength={layoutV2 ? 1024 : undefined}
              onChange={(evento) => setCorpo(evento.target.value)}
              aria-label={textos.formulario.corpo}
              aria-describedby="template-whatsapp-corpo-ajuda"
              required
            />
            <span id="template-whatsapp-corpo-ajuda" className="mt-1 block text-xs text-muted-foreground">
              {ajudaDasVariaveis ? `${ajudaDasVariaveis}. ` : null}
              {textos.formulario.corpoAjuda}
            </span>
          </div>
          {(analise.erro || erro) && (
            <p role="alert" className="text-sm text-destructive">
              {analise.erro ? ajudaDasVariaveis : erro}
            </p>
          )}
          </div>
          {layoutV2 && <section className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-muted/30 p-3">
            <h3 className="text-sm font-semibold">{textos.v2.previa}</h3>
            {corpo && <PreviaMensagem corpo={corpo} />}
          </section>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={salvando} onClick={onFechar}>
              {textos.formulario.cancelar}
            </Button>
            <Button type="submit" disabled={salvando || Boolean(analise.erro)}>
              {textos.formulario.salvar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
