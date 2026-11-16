import Link from "next/link";
import type { ComponentType, CSSProperties } from "react";

import { IconeFrontendV2 } from "@/components/shell/icone-frontend-v2";
import { OpcoesListaV2 } from "@/components/shell/opcoes-lista-v2";
import type { useTextos } from "@/lib/config/textos-provider";
import type { AgregacaoDeTags, Tag } from "@/lib/tags/types";

import estilos from "./tags-v2.module.css";

type TextosTags = ReturnType<typeof useTextos>["tags"];
type IconeDaTagProps = { nome: string | null; className?: string; style?: CSSProperties };
export type OrdemDasTags = "nome" | "uso";

const tom = (cor: string) => ({ "--tom": cor }) as CSSProperties;

/** Indicadores do topo. Os números chegam do backend já recortados pela visibilidade (RN-CRM-01). */
export function ResumoDeTagsV2({ totalTags, emUso, agregacao, textos, IconeDaTag }: {
  totalTags: number;
  emUso: number;
  agregacao: AgregacaoDeTags | undefined;
  textos: TextosTags;
  IconeDaTag: ComponentType<IconeDaTagProps>;
}) {
  const maisUsada = agregacao?.tagMaisUsada ?? null;
  const percentual = agregacao ? Math.round(agregacao.percentualTagueados) : 0;

  return (
    <div className={estilos.resumo}>
      <section className={estilos.cartao}>
        <header><span className={estilos.selo}><IconeFrontendV2 nome="price-tag-3-fill" /></span>{textos.dashboard.totalTags}</header>
        <p className={estilos.valor}>{totalTags}</p>
        <p className={estilos.apoio}>{textos.v2.emUso.replace("{n}", String(emUso))}</p>
      </section>
      <section className={estilos.cartao} style={tom("var(--cor-sucesso)")}>
        <header><span className={estilos.selo}><IconeFrontendV2 nome="user-follow-fill" /></span>{textos.v2.leadsComTag}</header>
        <p className={estilos.valor}>
          {percentual}%
          <span className={estilos.trilho} aria-hidden><span style={{ width: `${percentual}%` }} /></span>
        </p>
        <p className={estilos.apoio}>
          {textos.dashboard.leadsDeTotal
            .replace("{comTag}", String(agregacao?.leadsComTag ?? 0))
            .replace("{total}", String(agregacao?.totalLeadsVisiveis ?? 0))}
        </p>
      </section>
      <section className={estilos.cartao} style={maisUsada ? tom(maisUsada.cor) : undefined}>
        <header>
          <span className={estilos.selo}><IconeDaTag nome={maisUsada?.icone ?? null} /></span>
          {textos.dashboard.tagMaisUsada}
        </header>
        <p className={estilos.valor} data-texto>{maisUsada?.nome ?? "—"}</p>
        <p className={estilos.apoio}>
          {maisUsada ? textos.dashboard.leadsVinculados.replace("{n}", String(maisUsada.quantidade)) : textos.dashboard.semDados}
        </p>
      </section>
    </div>
  );
}

export function ListaDeTagsV2({
  tags, totalTags, contagens, totalVisivel, textos, busca, onBuscar, ordem, onOrdenar, verContatos, onEditar, onRemover, IconeDaTag,
}: {
  tags: Tag[];
  totalTags: number;
  contagens: Map<string, number>;
  totalVisivel: number;
  textos: TextosTags;
  busca: string;
  onBuscar: (valor: string) => void;
  ordem: OrdemDasTags;
  onOrdenar: (ordem: OrdemDasTags) => void;
  verContatos: boolean;
  onEditar?: (tag: Tag) => void;
  onRemover?: (tag: Tag) => void;
  IconeDaTag: ComponentType<IconeDaTagProps>;
}) {
  const maiorContagem = Math.max(1, ...contagens.values());
  const resumo = (verContatos ? textos.v2.resumoLista : textos.v2.resumoListaSemAgenda)
    .replace("{exibidas}", String(tags.length))
    .replace("{total}", String(totalTags));

  return (
    <section className={estilos.painel} aria-label={textos.v2.todasTitulo}>
      <div className={estilos.painelTopo}>
        <div className="min-w-0 flex-1">
          <h2>{textos.v2.todasTitulo}</h2>
          <p>{resumo}</p>
        </div>
        <label className={estilos.busca}>
          <IconeFrontendV2 nome="search-line" />
          <input value={busca} onChange={(evento) => onBuscar(evento.target.value)} placeholder={textos.busca} aria-label={textos.busca} />
        </label>
        <OpcoesListaV2<OrdemDasTags> rotulo={textos.v2.ordenar} valor={ordem} onChange={onOrdenar}
          opcoes={[{ valor: "uso", rotulo: textos.v2.maisUsadas }, { valor: "nome", rotulo: textos.v2.alfabetica }]} />
      </div>
      <div className={estilos.colunas} aria-hidden>
        <span>{textos.v2.colunaTag}</span>
        <span>{textos.v2.colunaUso}</span>
        <span className={estilos.numero}>{textos.v2.colunaLeads}</span>
        <span />
      </div>
      <ul className={estilos.linhas}>
        {tags.map((tag) => {
          const contagem = contagens.get(tag.id) ?? 0;
          const percentual = totalVisivel > 0 ? Math.round((contagem / totalVisivel) * 100) : 0;
          return (
            <li key={tag.id} className={estilos.linha} style={tom(tag.cor)}>
              <div className={estilos.identidade}>
                <span className={estilos.selo}><IconeDaTag nome={tag.icone} /></span>
                <strong>{tag.nome}</strong>
              </div>
              <div className={estilos.uso}>
                <span className={estilos.trilho} aria-hidden>
                  <span style={{ width: `${Math.round((contagem / maiorContagem) * 100)}%` }} />
                </span>
                <small>{percentual}%</small>
              </div>
              <span className={estilos.quantidade}>{contagem}</span>
              <div className={estilos.acoes}>
                <span className={estilos.pilula}><IconeDaTag nome={tag.icone} /><span>{tag.nome}</span></span>
                {verContatos && (
                  <Link href={`/agenda?tag=${encodeURIComponent(tag.id)}`} className={estilos.verContatos}>
                    {textos.v2.verContatos}<IconeFrontendV2 nome="arrow-right-up-line" />
                  </Link>
                )}
                {onEditar && (
                  <button type="button" className={estilos.icone} aria-label={`${textos.editar} ${tag.nome}`} title={textos.editar} onClick={() => onEditar(tag)}>
                    <IconeFrontendV2 nome="pencil-line" />
                  </button>
                )}
                {onRemover && (
                  <button type="button" className={estilos.icone} data-perigo aria-label={`${textos.remover} ${tag.nome}`} title={textos.remover} onClick={() => onRemover(tag)}>
                    <IconeFrontendV2 nome="delete-bin-line" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {tags.length === 0 && (
          <li className={estilos.vazio}>
            <strong>{textos.v2.vazioTitulo}</strong>
            {busca ? textos.semResultados : textos.vazio}
          </li>
        )}
      </ul>
    </section>
  );
}
