"use client";

import Link from "next/link";
import { ArrowRight, Megaphone, PencilLine } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { interpolarCatalogo } from "@/lib/atendimento/variaveis-do-template";
import { formatarDataHora, formatarNumero } from "@/lib/campanhas/formatacao";
import { usePodeEmCampanhas } from "@/lib/campanhas/hooks";
import type { Campanha } from "@/lib/campanhas/types";
import { percentual } from "@/lib/campanhas/validacao";
import { useTextos } from "@/lib/config/textos-provider";

import { BarraDeProgresso } from "./barra-de-progresso";
import { ChipDeStatus } from "./chip-de-status";

/** Esqueleto no formato real: cabeçalho e cinco linhas com a altura das linhas da tabela. */
export function EsqueletoDaTabela() {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm" aria-hidden>
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: 5 }, (_, indice) => (
        <Skeleton key={indice} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function destinoDaCampanha(
  campanha: Campanha,
  podeEditar: boolean,
): { href: string; rotulo: "abrir" | "continuarRascunho" } {
  return campanha.status === "RASCUNHO" && podeEditar
    ? { href: `/campanhas/nova?rascunho=${campanha.id}`, rotulo: "continuarRascunho" }
    : { href: `/campanhas/${campanha.id}`, rotulo: "abrir" };
}

function Inicio({ campanha }: { campanha: Campanha }) {
  const textos = useTextos().campanhas.lista;
  if (campanha.iniciadaEm) return <>{formatarDataHora(campanha.iniciadaEm)}</>;
  if (campanha.agendadaPara) {
    return <>{interpolarCatalogo(textos.agendadaPara, { data: formatarDataHora(campanha.agendadaPara) })}</>;
  }
  return <>{textos.naoIniciada}</>;
}

function Progresso({ campanha }: { campanha: Campanha }) {
  const textos = useTextos().campanhas.lista;
  // Funil acumulado: entregue e lido também contam como enviado.
  const { total, enviados: saiu } = campanha.contadores;
  const percentualEnviado = percentual(saiu, total);
  return (
    <div className="min-w-28 space-y-1">
      <BarraDeProgresso
        valor={percentualEnviado}
        tom={campanha.status === "CONCLUIDA" ? "sucesso" : "primario"}
        rotulo={interpolarCatalogo(textos.progressoDe, { percentual: String(percentualEnviado) })}
      />
      <p className="text-xs tabular-nums text-muted-foreground">
        {formatarNumero(saiu)} / {formatarNumero(total)}
      </p>
    </div>
  );
}

function Linha({ campanha }: { campanha: Campanha }) {
  const textos = useTextos().campanhas.lista;
  const destino = destinoDaCampanha(campanha, usePodeEmCampanhas("editar"));
  const Icone = destino.rotulo === "continuarRascunho" ? PencilLine : ArrowRight;
  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="max-w-56 px-4 py-3 font-medium">
        <Link href={destino.href} className="line-clamp-2 hover:underline focus-visible:underline">
          {campanha.nome}
        </Link>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{campanha.template.nome}</td>
      <td className="px-4 py-3">
        <ChipDeStatus status={campanha.status} />
      </td>
      <td className="px-4 py-3">
        <Progresso campanha={campanha} />
      </td>
      <td className="px-4 py-3 tabular-nums">
        {interpolarCatalogo(textos.porDia, { limite: formatarNumero(campanha.limiteDiario) })}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        <Inicio campanha={campanha} />
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={destino.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {textos[destino.rotulo]}
          <Icone aria-hidden />
        </Link>
      </td>
    </tr>
  );
}

const SEM_VALOR = "—";

/** Linha do layout V2: template sob o nome, leitura e respostas em colunas, limite sob o início. */
function LinhaV2({ campanha }: { campanha: Campanha }) {
  const catalogo = useTextos().campanhas;
  const textos = catalogo.lista;
  const destino = destinoDaCampanha(campanha, usePodeEmCampanhas("editar"));
  const Icone = destino.rotulo === "continuarRascunho" ? PencilLine : ArrowRight;
  const { total, enviados, lidos, respondidos } = campanha.contadores;
  const percentualEnviado = percentual(enviados, total);
  const taxa = (parte: number) => (enviados > 0 ? `${percentual(parte, enviados)}%` : SEM_VALOR);
  return (
    <tr data-status={campanha.status}>
      <td>
        <div data-slot="campanha-nome">
          <Megaphone aria-hidden />
          <div className="min-w-0">
            <Link href={destino.href}>{campanha.nome}</Link>
            <small>{campanha.template.nome}</small>
          </div>
        </div>
      </td>
      <td><ChipDeStatus status={campanha.status} /></td>
      <td>
        <div data-slot="campanha-progresso">
          <p>
            <span>
              <strong>{formatarNumero(enviados)}</strong>{" "}
              {interpolarCatalogo(catalogo.indicadores.deLimite, { limite: formatarNumero(total) })}
            </span>
            <span>{percentualEnviado}%</span>
          </p>
          <BarraDeProgresso
            valor={percentualEnviado}
            tom={campanha.status === "CONCLUIDA" ? "sucesso" : "primario"}
            rotulo={interpolarCatalogo(textos.progressoDe, { percentual: String(percentualEnviado) })}
          />
        </div>
      </td>
      <td data-numero>{taxa(lidos)}</td>
      <td data-numero>{taxa(respondidos)}</td>
      <td>
        <div data-slot="campanha-inicio">
          <span><Inicio campanha={campanha} /></span>
          <small>{interpolarCatalogo(textos.porDia, { limite: formatarNumero(campanha.limiteDiario) })}</small>
        </div>
      </td>
      <td data-acao>
        <Link href={destino.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {textos[destino.rotulo]}
          <Icone aria-hidden />
        </Link>
      </td>
    </tr>
  );
}

function TabelaV2({ campanhas }: { campanhas: Campanha[] }) {
  const catalogo = useTextos().campanhas;
  const colunas = catalogo.lista.colunas;
  return (
    <div data-slot="campanhas-tabela" className="hidden overflow-x-auto md:block">
      <table>
        <caption className="sr-only">{catalogo.lista.titulo}</caption>
        <thead>
          <tr>
            <th scope="col">{colunas.nome}</th>
            <th scope="col">{colunas.status}</th>
            <th scope="col">{colunas.progresso}</th>
            <th scope="col" data-numero>{catalogo.indicadores.lidas}</th>
            <th scope="col" data-numero>{catalogo.indicadores.respostas}</th>
            <th scope="col">{colunas.inicio}</th>
            <th scope="col" data-acao>{colunas.acoes}</th>
          </tr>
        </thead>
        <tbody>
          {campanhas.map((campanha) => <LinhaV2 key={campanha.id} campanha={campanha} />)}
        </tbody>
      </table>
    </div>
  );
}

export function TabelaDeCampanhas({ campanhas, v2 = false }: { campanhas: Campanha[]; v2?: boolean }) {
  const textos = useTextos().campanhas.lista;
  const colunas = textos.colunas;
  if (v2) return <TabelaV2 campanhas={campanhas} />;
  const titulos = [colunas.nome, colunas.template, colunas.status, colunas.progresso, colunas.limite, colunas.inicio];
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-sm md:block">
      <table className="w-full min-w-176 text-left text-sm">
        <caption className="sr-only">{textos.titulo}</caption>
        <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {titulos.map((titulo) => (
              <th key={titulo} scope="col" className="px-4 py-3 font-medium">
                {titulo}
              </th>
            ))}
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {colunas.acoes}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {campanhas.map((campanha) => (
            <Linha key={campanha.id} campanha={campanha} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
