"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Copy, Layers, Pencil, Plus, Search, Trash2, Zap } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useCapacidades } from "@/lib/gestao/use-capacidades";
import { useTextos } from "@/lib/config/textos-provider";
import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";
import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import listaV2 from "@/components/shell/lista-v2.module.css";
import { copiarTexto } from "@/lib/mensagens/copiar-texto";
import { cn } from "@/lib/utils";
import {
  criarMensagemRapida,
  editarMensagemRapida,
  listarMensagensRapidas,
  removerMensagemRapida,
} from "@/lib/suporte/api";
import type { MensagemRapida } from "@/lib/suporte/types";
import estilos from "./mensagens-rapidas-v2.module.css";

export function PaginaMensagensRapidas() {
  const t = useTextos().mensagensRapidas;
  const layoutV2 = useFuncionalidadesHabilitadas().data?.includes("mensagens_rapidas_layout_v2") ?? false;
  // Só apresentação: agrupa por autor para quem enxerga as mensagens de toda a equipe.
  const gestor = ["SUBGESTOR", "GESTOR", "ADMINISTRADOR"].includes(useAuthStore((s) => s.papel) ?? "");
  const capacidades = useCapacidades();
  const podeCriar = capacidades.pode("mensagens_rapidas.criar");
  const podeEditarExcluir = capacidades.pode("mensagens_rapidas.editar_excluir");
  const cache = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [edicao, setEdicao] = useState<MensagemRapida | null>(null);
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ["mensagens-rapidas"],
    queryFn: () => listarMensagensRapidas(),
  });
  const remover = useMutation({
    mutationFn: removerMensagemRapida,
    onSuccess: () => cache.invalidateQueries({ queryKey: ["mensagens-rapidas"] }),
  });

  const grupos = agruparPorAtendente(consulta.data ?? []);
  const termo = busca.trim().replace(/^\//, "").toLocaleLowerCase("pt-BR");
  const gruposExibidos = layoutV2 ? grupos
    .filter((grupo) => lista === null || grupo.atendenteId === lista)
    .map((grupo) => ({
      ...grupo,
      itens: grupo.itens.filter(({ palavraChave, conteudo }) =>
        palavraChave.toLocaleLowerCase("pt-BR").includes(termo) || conteudo.toLocaleLowerCase("pt-BR").includes(termo)),
    }))
    .filter((grupo) => grupo.itens.length > 0) : grupos;

  return (
    <div data-layout={layoutV2 ? "v2" : "legado"} className={layoutV2 ? listaV2.pagina : "space-y-5 p-6"}>
      {layoutV2 && <CabecalhoListaV2 titulo={t.titulo} />}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t.titulo}</h1>
          <p className="text-sm text-muted-foreground">{t.descricao}</p>
        </div>
        {podeCriar && <Button data-slot="lista-v2-acao" onClick={() => setAberto(true)}>
          {layoutV2 && <Plus aria-hidden />}
          {t.nova}
        </Button>}
      </header>

      {!layoutV2 && <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <Zap className="size-[calc(var(--tamanho-icone-interface)*1.25)] shrink-0 text-primary" />
        <p className="text-sm text-primary">{t.dica}</p>
      </div>}

      <div className={layoutV2 ? estilos.corpo : undefined}>
        {layoutV2 && (
          <aside className={estilos.listas} aria-label={t.v2.listas}>
            <h2>{t.v2.listas}</h2>
            <button type="button" aria-pressed={lista === null} onClick={() => setLista(null)}>
              <Layers aria-hidden className="size-4" />
              <span>{t.v2.todas}</span><small>{consulta.data?.length ?? 0}</small>
            </button>
            {grupos.map((grupo) => (
              <button type="button" key={grupo.atendenteId} aria-pressed={lista === grupo.atendenteId} onClick={() => setLista(grupo.atendenteId)}>
                <AvatarIniciais id={grupo.atendenteId} nome={grupo.atendenteNome}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" />
                <span>{grupo.atendenteNome}</span><small>{grupo.itens.length}</small>
              </button>
            ))}
            <p>{t.dica}</p>
          </aside>
        )}
        <div className={layoutV2 ? estilos.conteudo : undefined}>
        {layoutV2 && (
          <div className={estilos.busca}>
            <label>
              <Search aria-hidden className="size-4" />
              <Input aria-label={t.v2.buscar} placeholder={t.v2.buscar} value={busca}
                onChange={(evento) => setBusca(evento.target.value)} />
            </label>
            <span>{t.v2.total.replace("{total}", String(gruposExibidos.reduce((total, grupo) => total + grupo.itens.length, 0)))}</span>
          </div>
        )}
      {consulta.isLoading ? (
        <p>{t.carregando}</p>
      ) : consulta.isError ? (
        <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => consulta.refetch()} />
      ) : !gruposExibidos.length ? (
        <p className="text-muted-foreground">{t.vazio}</p>
      ) : (
        <div className="space-y-6">
          {gruposExibidos.map((grupo) => (
            <div key={grupo.atendenteId}>
              {(gestor || layoutV2) && (
                <div className="mb-3 flex items-center gap-2.5">
                  <AvatarIniciais
                    id={grupo.atendenteId}
                    nome={grupo.atendenteNome}
                    className={cn("flex size-8 shrink-0 items-center justify-center text-xs font-bold text-white", layoutV2 ? "rounded-full" : "rounded-lg")}
                  />
                  <span className="text-sm font-bold">{grupo.atendenteNome}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                    {grupo.itens.length}
                  </span>
                </div>
              )}
              <div className={layoutV2 ? estilos.grade : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
                {grupo.itens.map((mensagem) => (
                  <CardDeMensagemRapida
                    key={mensagem.id}
                    mensagem={mensagem}
                    textos={t}
                    layoutV2={layoutV2}
                    onEditar={podeEditarExcluir ? () => setEdicao(mensagem) : undefined}
                    onRemover={podeEditarExcluir ? () => remover.mutate(mensagem.id) : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
        </div>
      </div>

      <Formulario aberto={aberto && podeCriar} onFechar={() => setAberto(false)} />
      {edicao && podeEditarExcluir && <Formulario aberto existente={edicao} onFechar={() => setEdicao(null)} />}
    </div>
  );
}

type TextosMensagensRapidas = ReturnType<typeof useTextos>["mensagensRapidas"];

function agruparPorAtendente(
  itens: MensagemRapida[],
): { atendenteId: string; atendenteNome: string; itens: MensagemRapida[] }[] {
  const porId = new Map<string, { atendenteId: string; atendenteNome: string; itens: MensagemRapida[] }>();
  for (const item of itens) {
    const grupo = porId.get(item.atendenteId);
    if (grupo) {
      grupo.itens.push(item);
    } else {
      porId.set(item.atendenteId, {
        atendenteId: item.atendenteId,
        atendenteNome: item.atendenteNome,
        itens: [item],
      });
    }
  }
  return [...porId.values()];
}

function CardDeMensagemRapida({
  mensagem,
  textos,
  layoutV2,
  onEditar,
  onRemover,
}: {
  mensagem: MensagemRapida;
  textos: TextosMensagensRapidas;
  layoutV2: boolean;
  onEditar?: () => void;
  onRemover?: () => void;
}) {
  const [resultadoCopia, setResultadoCopia] = useState<string | null>(null);

  return (
    <div className={cn("flex flex-col gap-2.5 rounded-lg border bg-card p-4", layoutV2 && estilos.cartao)}>
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary">
          /{mensagem.palavraChave}
        </span>
        <div className="ml-auto flex gap-1">
          {layoutV2 && <Button type="button" size="icon" variant="ghost" className="size-8"
            aria-label={`${textos.v2.copiar} /${mensagem.palavraChave}`}
            onClick={async () => setResultadoCopia(await copiarTexto(mensagem.conteudo) ? textos.v2.copiado : textos.v2.erroCopia)}>
            <Copy aria-hidden />
          </Button>}
          {onEditar && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={`${textos.editar} /${mensagem.palavraChave}`}
              onClick={onEditar}
            >
              <Pencil className="size-(--tamanho-icone-interface)" />
            </Button>
          )}
          {onRemover && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-destructive hover:text-destructive"
              aria-label={`${textos.remover} /${mensagem.palavraChave}`}
              onClick={onRemover}
            >
              <Trash2 className="size-(--tamanho-icone-interface)" />
            </Button>
          )}
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{mensagem.conteudo}</p>
      {layoutV2 && <div className={estilos.rodape}>
        <span>{textos.v2.caracteres.replace("{total}", String(Array.from(mensagem.conteudo).length))}</span>
        {resultadoCopia && <span role="status">{resultadoCopia}</span>}
      </div>}
    </div>
  );
}

function Formulario({
  aberto,
  existente,
  onFechar,
}: {
  aberto: boolean;
  existente?: MensagemRapida;
  onFechar: () => void;
}) {
  const t = useTextos().mensagensRapidas.formulario;
  const cache = useQueryClient();
  const [chave, setChave] = useState(existente?.palavraChave ?? "");
  const [conteudo, setConteudo] = useState(existente?.conteudo ?? "");
  const salvar = useMutation({
    mutationFn: () =>
      existente
        ? editarMensagemRapida(existente.id, { palavraChave: chave, conteudo })
        : criarMensagemRapida({ palavraChave: chave, conteudo }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["mensagens-rapidas"] });
      onFechar();
    },
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existente ? t.editarTitulo : t.criarTitulo}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <label className="block space-y-1">
            <span>{t.chave}</span>
            <div className="flex items-center">
              <span className="px-2 font-mono">/</span>
              <Input
                required
                pattern={String.raw`[\p{L}\p{N}_\-]+`}
                value={chave}
                onChange={(e) => setChave(e.target.value)}
              />
            </div>
          </label>
          <label className="block space-y-1">
            <span>{t.conteudo}</span>
            <Textarea required value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
          </label>
          {salvar.isError && <p className="text-destructive">{t.erro}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              {t.cancelar}
            </Button>
            <Button type="submit">{t.salvar}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
