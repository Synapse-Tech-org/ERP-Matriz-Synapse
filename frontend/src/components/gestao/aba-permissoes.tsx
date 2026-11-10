"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronsUpDown, Copy, Info, Lock, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GradeEmColunas } from "@/components/ui/grade-em-colunas";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { preverCopiaDePerfil } from "@/lib/gestao/api";
import {
  aplicarNivel,
  alternarAcao,
  chavesAlteradas,
  configuravel,
  contagem,
  normalizar,
  rascunhoDoPerfil,
  simular,
  tocaSensivel,
  type Simulacao,
  type ViolacaoDaDelegacao,
} from "@/lib/gestao/rascunho";
import { NIVEIS } from "@/lib/gestao/types";
import type { Catalogo, CapacidadeDoCatalogo, MinhasPermissoes, Nivel, Papel, Perfil, PreviaDeCopia, Rascunho } from "@/lib/gestao/types";
import { useCatalogo, usePerfis, useSalvarPerfil } from "@/lib/gestao/use-gestao";
import { cn } from "@/lib/utils";

import {
  AlcanceFixo,
  ICONE_DO_MODULO,
  ICONE_DO_PAPEL,
  Legenda,
  SeloSensivel,
  SeletorDeNivel,
  foraDaAlcada,
  motivoDoBloqueio,
  motivoForaDaAlcada,
  perfilFixoDoAtor,
  preencher,
  rotuloDaCapacidade,
  rotuloDoModulo,
  useConfirmacaoDeDescarte,
  useProtecaoDeSaida,
  type TextosGestao,
} from "./apoio";
import { BarraDeAlteracoes } from "./barra-de-alteracoes";
import visual from "./gestao-v2.module.css";
import { DialogoDeCopia } from "./dialogo-de-copia";

/**
 * Peso de um cartão na grade, em "linhas de ação": cabeçalho e seletor de nível ocupam cerca de
 * três. Conta só o que a busca lista — nunca o estado dos interruptores, que muda a cada clique.
 */
const LINHAS_DO_CABECALHO = 3;
const ORDEM_V2 = ["atendimentos", "templates", "resumo_ia", "contatos", "pipeline", "dashboard", "tags", "mensagens_rapidas", "banco_arquivos", "campanhas", "automacao", "relatorios"];
const posicaoV2 = (id: string) => ORDEM_V2.includes(id) ? ORDEM_V2.indexOf(id) : ORDEM_V2.length;

interface EstadoDoRascunho {
  papel: Papel;
  revisao: number;
  rascunho: Rascunho;
  copiadoDe?: Papel;
}

export function AbaPermissoes({
  textos,
  minhas,
  layoutV2 = false,
  excecoesPorPerfil,
  papelInicial,
  onSujoChange,
}: {
  textos: TextosGestao;
  minhas: MinhasPermissoes;
  layoutV2?: boolean;
  excecoesPorPerfil?: readonly { papel: Papel; excecoes: number }[];
  papelInicial?: Papel;
  onSujoChange: (sujo: boolean) => void;
}) {
  const catalogo = useCatalogo();
  const perfis = usePerfis();
  const salvar = useSalvarPerfil();
  const [selecionado, setSelecionado] = useState<Papel | null>(papelInicial ?? null);
  const [busca, setBusca] = useState("");
  const [abrirTodos, setAbrirTodos] = useState<boolean | null>(null);
  const [abertura, setAbertura] = useState<Record<string, boolean>>({});
  const [estado, setEstado] = useState<EstadoDoRascunho | null>(null);
  const [copia, setCopia] = useState<{ origem: Papel; previa?: PreviaDeCopia; erro: boolean } | null>(null);

  // Sem escolha explícita, abre no primeiro perfil que quem está logado pode editar.
  const papel: Papel = selecionado ?? (layoutV2 && perfis.data?.some((p) => p.papel === "ATENDENTE") ? "ATENDENTE" : undefined) ?? perfis.data?.find((p) => p.editavel)?.papel ?? "SUBGESTOR";
  const perfil = perfis.data?.find((p) => p.papel === papel);
  const base = useMemo(() => (perfil ? rascunhoDoPerfil(perfil.modulos, perfil.capacidades) : null), [perfil]);
  const rascunho = estado && estado.papel === papel ? estado.rascunho : base;
  const alteradas = base && rascunho ? chavesAlteradas(base, rascunho) : [];
  const sujo = alteradas.length > 0;
  const protecao = useProtecaoDeSaida(sujo, textos);
  const confirmacao = useConfirmacaoDeDescarte(sujo, textos);

  function atualizar(novo: Rascunho, copiadoDe?: Papel) {
    if (!perfil) return;
    setEstado({ papel, revisao: estado?.papel === papel ? estado.revisao : perfil.revisao, rascunho: novo, copiadoDe: copiadoDe ?? estado?.copiadoDe });
    salvar.reset();
    onSujoChange(true);
  }

  function descartar() {
    setEstado(null);
    salvar.reset();
    onSujoChange(false);
  }

  if (catalogo.isLoading || perfis.isLoading) return <p className="text-sm text-muted-foreground">{textos.carregando}</p>;
  if (catalogo.isError || perfis.isError || !catalogo.data || !perfis.data) {
    return <ErroDeCarregamento mensagem={textos.erro} onTentarNovamente={() => void Promise.all([catalogo.refetch(), perfis.refetch()])} />;
  }

  const cat = catalogo.data;
  const sim = perfil && rascunho ? simular(cat, papel, rascunho) : null;
  const editavel = perfil?.editavel === true;
  const atorFixo = perfilFixoDoAtor(minhas);
  const termo = normalizar(busca);
  const modulosVisiveis = cat.modulos.filter((m) => {
    if (!termo) return true;
    const r = rotuloDoModulo(textos, m.id);
    if (normalizar(`${r.rotulo} ${r.descricao} ${m.id}`).includes(termo)) return true;
    return cat.capacidades.some((c) => c.modulo === m.id && normalizar(`${rotuloDaCapacidade(textos, c.id)} ${c.id}`).includes(termo));
  });
  if (layoutV2) modulosVisiveis.sort((a, b) => posicaoV2(a.id) - posicaoV2(b.id));
  const origensDeCopia: Papel[] = (["SUBGESTOR", "ATENDENTE", "OPERADOR"] as Papel[]).filter((p) => p !== papel);

  const origemPreferida = (papel === "ATENDENTE" ? "OPERADOR" : "ATENDENTE") satisfies Papel;
  const atalhoDeCopia = layoutV2 && perfis.data.some((p) => p.papel === origemPreferida) ? origemPreferida : null;

  /** A troca do rascunho atual por `novo` cabe na alçada de quem edita? (fixo: sempre) */
  function avaliar(novo: Rascunho): ViolacaoDaDelegacao | null {
    if (!sim || !rascunho) return null;
    return foraDaAlcada(minhas, cat, { acoes: rascunho.acoes, simulacao: sim },
      () => ({ acoes: novo.acoes, simulacao: simular(cat, papel, novo) }));
  }

  async function abrirCopia(origem: Papel) {
    setCopia({ origem, erro: false });
    try {
      const previa = await preverCopiaDePerfil(papel, origem);
      setCopia({ origem, previa, erro: false });
    } catch {
      setCopia({ origem, erro: true });
    }
  }

  function moduloAberto(id: string) {
    return abertura[id] ?? abrirTodos ?? Boolean(termo);
  }
  const todosAbertos = modulosVisiveis.every((m) => moduloAberto(m.id));
  const totalAjustes = excecoesPorPerfil?.filter((u) => u.papel === papel && u.excecoes > 0).length ?? 0;
  const usuariosDoPerfil = perfil ? preencher(perfil.usuarios === 1 ? textos.resumoPerfil.usuario : textos.resumoPerfil.usuarios, { n: perfil.usuarios }) : "";
  const IconePerfil = ICONE_DO_PAPEL[papel];
  const barra = (
    <div className={layoutV2 ? visual.controles : "flex flex-wrap items-center gap-3"}>
        <label className={layoutV2 ? visual.busca : "relative w-full max-w-sm"}>
          <span className="sr-only">{textos.permissoes.busca}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={busca} onChange={(e) => { setBusca(e.target.value); setAbrirTodos(null); setAbertura({}); }} placeholder={layoutV2 ? textos.v2.buscaPermissao : textos.permissoes.busca} className="h-10 bg-card pl-9" />
        </label>
        {!layoutV2 && <Legenda textos={textos} />}
        {/* Cópia de perfil é de superior: a única origem para o perfil ATENDENTE está fora da alçada do subgestor. */}
        {editavel && atorFixo && (
          <div className={layoutV2 ? visual.copia : "ml-auto"}>
            {atalhoDeCopia && <Button variant="outline" onClick={() => void abrirCopia(atalhoDeCopia)}>
              <Copy aria-hidden className="size-4" />{preencher(textos.v2.copiarDoPerfil, { perfil: textos.papeis[atalhoDeCopia] })}
            </Button>}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" aria-label={atalhoDeCopia ? textos.permissoes.copiar : undefined} className="h-10 gap-2 bg-card" />}>
                {!atalhoDeCopia && <><Copy className="size-(--tamanho-icone-interface)" aria-hidden />{textos.permissoes.copiar}</>}
                <ChevronDown className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {origensDeCopia.map((origem) => (
                  <DropdownMenuItem key={origem} onClick={() => void abrirCopia(origem)}>
                    {preencher(textos.permissoes.copiarDe, { perfil: textos.papeis[origem] })}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem disabled>
                  {preencher(textos.permissoes.copiarIndisponivel, { perfil: textos.papeis.GESTOR })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {layoutV2 && modulosVisiveis.length > 0 && <Button variant="outline" className={visual.botao}
          onClick={() => { setAbrirTodos(!todosAbertos); setAbertura({}); }}>
          <ChevronsUpDown aria-hidden className="size-4" />
          {todosAbertos ? textos.v2.recolher : textos.v2.expandir}
        </Button>}
      </div>
  );
  function mostrarModulo(moduloId: string) {
    if (!sim || !rascunho) return null;
    return <CartaoDeModulo
      moduloId={moduloId}
      catalogo={cat}
      papel={papel}
      simulacao={sim}
      editavel={editavel}
      termo={termo}
      textos={textos}
      aberto={layoutV2 ? moduloAberto(moduloId) : undefined}
      onAlternar={() => setAbertura((anterior) => ({ ...anterior, [moduloId]: !moduloAberto(moduloId) }))}
      avaliarNivel={(nivel) => avaliar(aplicarNivel(rascunho, cat, papel, moduloId, nivel))}
      avaliarAcao={(id, valor) => avaliar(alternarAcao(rascunho, id, valor))}
      onNivel={(nivel) => atualizar(aplicarNivel(rascunho, cat, papel, moduloId, nivel))}
      onAcao={(id, valor) => atualizar(alternarAcao(rascunho, id, valor))}
    />;
  }

  return (
    <div className={layoutV2 ? visual.perfis : "space-y-4"}>
      {!layoutV2 && barra}
      <div className={layoutV2 ? visual.gradePerfis : "grid grid-cols-1 gap-5 lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]"}>
        <aside className={layoutV2 ? visual.lateral : "space-y-3 lg:sticky lg:top-4 lg:self-start"}>
          {!layoutV2 && <p className="px-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{textos.permissoes.perfil}</p>}
          <div role="radiogroup" aria-label={textos.permissoes.perfil} className="space-y-2.5">
            {perfis.data.map((p) => (
              <CartaoDePerfil
                key={p.papel}
                layoutV2={layoutV2}
                perfil={p}
                catalogo={cat}
                selecionado={p.papel === papel}
                simulacao={p.papel === papel && sim ? sim : null}
                textos={textos}
                onSelecionar={() => confirmacao.executar(() => {
                  descartar();
                  setSelecionado(p.papel);
                  setAbrirTodos(null);
                  setAbertura({});
                })}
              />
            ))}
          </div>
          {layoutV2 ? <div className={visual.legenda}>
            <h2>{textos.v2.comoFuncionam}</h2>
            {NIVEIS.map((nivel) => <div key={nivel}>
              <i aria-hidden data-nivel={nivel} />
              <p><strong>{textos.permissoes.niveis[nivel]}</strong><span>{textos.v2.niveisAjuda[nivel]}</span></p>
            </div>)}
            <div className={visual.sensivel}><SeloSensivel textos={textos} /><p>{textos.v2.sensivel}</p></div>
            <div><Info aria-hidden className="size-4 shrink-0" /><p>{textos.permissoes.notaHeranca}</p></div>
          </div> : <p className="flex gap-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            {textos.permissoes.notaHeranca}
          </p>}
          {!editavel && perfil && !perfil.fixo && (
            <p className="flex gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
              {perfil.papel === minhas.papel ? textos.excecoes.proprio : textos.permissoes.somenteLeitura}
            </p>
          )}
        </aside>

        <div className={layoutV2 ? visual.painel : "min-w-0"}>
          {layoutV2 && <div className={visual.topoPainel}>
            <span className={visual.iconePerfil} data-papel={papel}><IconePerfil aria-hidden className="size-5" /></span>
            <div className={visual.tituloPainel}>
              <h2>{preencher(textos.v2.permissoesPerfil, { perfil: textos.papeis[papel] })}</h2>
              <p>{preencher(totalAjustes ? textos.v2.ajustesPerfil : textos.v2.impactoPerfil, { usuarios: usuariosDoPerfil, ajustes: totalAjustes })}</p>
            </div>
            {barra}
          </div>}
          {perfil?.fixo && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-medium text-accent-foreground">
              <Lock className="size-3.5" aria-hidden />
              {textos.permissoes.fixoAviso}
            </p>
          )}
          {editavel && !atorFixo && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              {textos.permissoes.alcadaDelegada}
            </p>
          )}
          {modulosVisiveis.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{textos.permissoes.vazio}</p>
          ) : (
            layoutV2 ? <div className={visual.modulos}>
              <div aria-hidden className={visual.rotulosModulos}>
                <span>{textos.v2.modulo}</span><span>{textos.v2.nivel}</span><span>{textos.v2.acoesLiberadas}</span>
              </div>
              {modulosVisiveis.map((m) => <div key={m.id}>{mostrarModulo(m.id)}</div>)}
            </div> : sim && rascunho && (
              <GradeEmColunas
                itens={modulosVisiveis}
                colunasMaximas={2}
                chave={(m) => m.id}
                peso={(m) => LINHAS_DO_CABECALHO + capacidadesListadas(cat, m.id, termo, textos).length}
              >
                {(m) => mostrarModulo(m.id)}
              </GradeEmColunas>
            )
          )}
          {perfil && editavel && (
            <BarraDeAlteracoes
              textos={textos}
              quantidade={alteradas.length}
              impacto={preencher(textos.barra.impactoPerfil, { n: perfil.usuarios })}
              sensivel={tocaSensivel(cat, alteradas)}
              salvando={salvar.isPending}
              erro={salvar.error}
              onDescartar={descartar}
              onRecarregar={() => {
                descartar();
                void perfis.refetch();
              }}
              onSalvar={() => {
                if (!rascunho || !estado) return;
                salvar.mutate(
                  { papel, revisao: estado.revisao, rascunho, copiadoDe: estado.copiadoDe },
                  { onSuccess: () => descartar() },
                );
              }}
            />
          )}
        </div>
      </div>

      {copia && (
        <DialogoDeCopia
          textos={textos}
          origem={textos.papeis[copia.origem]}
          previa={copia.previa}
          carregando={!copia.previa && !copia.erro}
          erro={copia.erro}
          onFechar={() => setCopia(null)}
          onAplicar={() => {
            if (copia.previa) atualizar({ niveis: copia.previa.niveis, acoes: copia.previa.acoes }, copia.origem);
            setCopia(null);
          }}
        />
      )}
      {protecao}
      {confirmacao.dialogo}
    </div>
  );
}

function CartaoDePerfil({
  layoutV2,
  perfil,
  catalogo,
  selecionado,
  simulacao,
  textos,
  onSelecionar,
}: {
  layoutV2: boolean;
  perfil: Perfil;
  catalogo: Catalogo;
  selecionado: boolean;
  simulacao: Simulacao | null;
  textos: TextosGestao;
  onSelecionar: () => void;
}) {
  const Icone = ICONE_DO_PAPEL[perfil.papel];
  const { permitidas, total } = simulacao
    ? contagem(catalogo, perfil.papel, simulacao)
    : { permitidas: perfil.permitidas, total: perfil.total };
  const percentual = total === 0 ? 0 : Math.round((permitidas / total) * 100);
  const usuarios = preencher(perfil.usuarios === 1 ? textos.resumoPerfil.usuario : textos.resumoPerfil.usuarios, { n: perfil.usuarios });
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selecionado}
      data-perfil={layoutV2 ? perfil.papel : undefined}
      onClick={onSelecionar}
      className={cn(
        "w-full rounded-xl border bg-card p-3.5 text-left transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selecionado ? "border-primary shadow-[0_0_0_3px_var(--accent)]" : "border-border hover:shadow-sm",
        layoutV2 && visual.cartaoPerfil,
      )}
    >
      <span className="flex items-center gap-3">
        <span className={layoutV2 ? visual.iconePerfil : "flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"} data-papel={perfil.papel}>
          <Icone className="size-(--tamanho-icone-interface)" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-foreground">{textos.papeis[perfil.papel]}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {usuarios}
            {layoutV2 ? " · " + textos.v2.perfisDescricaoCurta[perfil.papel] : perfil.fixo && " · " + textos.resumoPerfil.acessoTotal}
          </span>
        </span>
        {perfil.fixo && <span className={layoutV2 ? visual.fixo : undefined}><Lock className="size-4 text-muted-foreground" aria-hidden />{layoutV2 && textos.v2.fixo}</span>}
      </span>
      <span className="mt-3 flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${percentual}%` }} />
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
          {perfil.fixo ? (layoutV2 ? textos.v2.todas : percentual + "%") : preencher(layoutV2 ? textos.v2.acoesPerfil : textos.resumoPerfil.permissoes, { permitidas, total })}
        </span>
      </span>
    </button>
  );
}

/** Linhas do cartão: as ações que casam com a busca; nenhuma casou, o módulo casou pelo nome e vai inteiro. */
function capacidadesListadas(catalogo: Catalogo, moduloId: string, termo: string, textos: TextosGestao): CapacidadeDoCatalogo[] {
  const capacidades = catalogo.capacidades.filter((c) => c.modulo === moduloId);
  if (!termo) return capacidades;
  const visiveis = capacidades.filter((c) => normalizar(`${rotuloDaCapacidade(textos, c.id)} ${c.id}`).includes(termo));
  return visiveis.length > 0 ? visiveis : capacidades;
}

function CartaoDeModulo({
  moduloId,
  catalogo,
  papel,
  simulacao,
  editavel,
  termo,
  textos,
  aberto,
  onAlternar,
  avaliarNivel,
  avaliarAcao,
  onNivel,
  onAcao,
}: {
  moduloId: string;
  catalogo: Catalogo;
  papel: Papel;
  simulacao: Simulacao;
  editavel: boolean;
  termo: string;
  textos: TextosGestao;
  aberto?: boolean;
  onAlternar: () => void;
  /** O que a troca faria fora da alçada de quem edita; `null` = cabe. */
  avaliarNivel: (nivel: Nivel) => ViolacaoDaDelegacao | null;
  avaliarAcao: (id: string, valor: boolean) => ViolacaoDaDelegacao | null;
  onNivel: (nivel: Nivel) => void;
  onAcao: (id: string, valor: boolean) => void;
}) {
  const modulo = catalogo.modulos.find((m) => m.id === moduloId)!;
  const { rotulo, descricao } = rotuloDoModulo(textos, moduloId);
  const Icone = ICONE_DO_MODULO[moduloId] ?? Info;
  const capacidades = catalogo.capacidades.filter((c) => c.modulo === moduloId);
  const lista = capacidadesListadas(catalogo, moduloId, termo, textos);
  const configuraveis = capacidades.filter((c) => configuravel(c, papel));
  const permitidas = configuraveis.filter((c) => simulacao.estados[c.id]?.permitido).length;
  const maximo = modulo.nivelMaximoPorPapel[papel];
  const linha = aberto !== undefined;

  return (
    <section aria-labelledby={`modulo-${moduloId}`} className={linha ? visual.modulo : "rounded-2xl border border-border bg-card p-4 shadow-xs"}>
      <div className={linha ? visual.linhaModulo : undefined}>
      <div className={linha ? visual.nomeModulo : "mb-3 flex items-start gap-3"}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <Icone className="size-(--tamanho-icone-interface)" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`modulo-${moduloId}`} className="text-sm font-bold text-foreground">{linha
            ? <button type="button" aria-expanded={aberto} aria-controls={"acoes-" + moduloId} onClick={onAlternar}>{rotulo}</button>
            : rotulo}</h2>
          <p className="truncate text-xs text-muted-foreground">{descricao}</p>
        </div>
        {!linha && <span className="shrink-0 rounded-md bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
          {permitidas}/{configuraveis.length}
        </span>}
      </div>
      <SeletorDeNivel
        valor={simulacao.niveis[moduloId]}
        minimo={modulo.nivelMinimoPermitido}
        maximo={maximo}
        desabilitado={!editavel}
        nivelPermitido={(nivel) => avaliarNivel(nivel) === null}
        rotulo={preencher(textos.permissoes.nivelRotulo, { modulo: rotulo })}
        textos={textos}
        onChange={onNivel}
      />
      {linha && <>
        <div className={visual.contagem}><span aria-hidden><i style={{ width: (configuraveis.length ? 100 * permitidas / configuraveis.length : 0) + "%" }} /></span>{permitidas}/{configuraveis.length}</div>
        <button type="button" aria-expanded={aberto} aria-hidden tabIndex={-1} className={visual.expandirModulo} onClick={onAlternar}><ChevronDown aria-hidden className="size-4" /></button>
      </>}
      </div>
      <ul id={"acoes-" + moduloId} hidden={aberto === false} className={linha ? visual.acoesModulo : "mt-2 divide-y divide-border"}>
        {aberto !== false && lista.map((c) => {
          const estado = simulacao.estados[c.id];
          const nome = rotuloDaCapacidade(textos, c.id);
          if (c.tipo === "ALCANCE_ESTRUTURAL") {
            const alcance = c.alcancePorPapel[papel] ?? "MEUS";
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">{nome}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {alcance === "MEUS" ? textos.permissoes.motivos.ESTRUTURAL_MEUS : textos.permissoes.motivos.ESTRUTURAL_TODOS}
                  </p>
                </div>
                <AlcanceFixo alcance={alcance} textos={textos} />
              </li>
            );
          }
          const motivo = motivoDoBloqueio(textos, { motivo: estado.motivo, alcance: null }, c.nivelMinimo, c.dependencias);
          const bloqueado = estado.motivo === "TETO_DO_PAPEL" || estado.motivo === "FLAG_DESLIGADA"
            || estado.motivo === "NIVEL_DO_MODULO" || estado.motivo === "DEPENDENCIA";
          const violacao = editavel && !bloqueado ? avaliarAcao(c.id, !estado.permitido) : null;
          const alteravel = editavel && !bloqueado && estado.origem !== "FIXO" && violacao === null;
          const dica = !editavel || bloqueado ? motivo : violacao ? motivoForaDaAlcada(textos, violacao, c.id) : null;
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-foreground">
                  {nome}
                  {c.sensivel && <SeloSensivel textos={textos} />}
                </p>
                {dica && (
                  <p id={`motivo-${papel}-${c.id}`} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="size-3" aria-hidden />
                    {dica}
                  </p>
                )}
              </div>
              <Switch
                checked={estado.permitido}
                disabled={!alteravel}
                aria-label={nome}
                aria-describedby={dica ? `motivo-${papel}-${c.id}` : undefined}
                onCheckedChange={(valor) => onAcao(c.id, valor)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
