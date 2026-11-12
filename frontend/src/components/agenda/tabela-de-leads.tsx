"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button } from "@/components/ui/button";
import type { EtapaAtendimento } from "@/lib/lead/types";
import type { UsuarioEquipe } from "@/lib/equipe/types";
import type { LeadDaAgenda, StatusBasicoLead } from "@/lib/agenda/types";
import type { Textos } from "@/lib/config/schema";

type TextosAgenda = Textos["agenda"];

const CHAVE_DE_STATUS: Record<StatusBasicoLead, keyof TextosAgenda["status"]> =
  {
    IA: "ia",
    EM_ATENDIMENTO: "emAtendimento",
    FINALIZADO: "finalizado",
  };

/** Pill colorida por significado (E18): IA em roxo, em atendimento em âmbar, finalizado em verde. */
const COR_DE_STATUS: Record<StatusBasicoLead, string> = {
  IA: "var(--cor-ia)",
  EM_ATENDIMENTO: "var(--cor-atencao)",
  FINALIZADO: "var(--cor-sucesso)",
};

const relativo = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto", style: "short" });
const dataCompleta = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function ultimoContato(valor: string, agora: number) {
  const data = new Date(valor);
  const minutos = Math.max(0, Math.floor((agora - data.getTime()) / 60_000));
  if (minutos < 60) return relativo.format(-minutos, "minute");
  if (minutos < 1_440) return relativo.format(-Math.floor(minutos / 60), "hour");
  if (minutos < 10_080) return relativo.format(-Math.floor(minutos / 1_440), "day");
  return dataCompleta.format(data);
}

interface Props {
  leads: LeadDaAgenda[];
  etapas: EtapaAtendimento[];
  equipe: UsuarioEquipe[];
  textos: TextosAgenda;
  onAbrirFicha: (lead: LeadDaAgenda) => void;
  /** Ausente quando o usuário não pode abrir atendimento (Gestão): a coluna fica sem o botão. */
  onAbrirAtendimento?: (lead: LeadDaAgenda) => void;
  abrindoLeadId?: string | null;
  layoutV2?: boolean;
}

export function TabelaDeLeads({
  leads,
  etapas,
  equipe,
  textos,
  onAbrirFicha,
  onAbrirAtendimento,
  abrindoLeadId = null,
  layoutV2 = false,
}: Props) {
  const [agora] = useState(() => Date.now());
  const etapaPorId = new Map(etapas.map((etapa) => [etapa.id, etapa]));
  const nomePorAtendenteId = new Map(
    equipe.map((usuario) => [usuario.id, usuario.nome]),
  );

  return (
    <div data-slot="agenda-tabela" className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr>
            <th className="px-5 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.lead}
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.telefone}
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.cidade}
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.etapa}
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.tags}
            </th>
            <th className="px-5 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.responsavel}
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.ultimoContato}
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              <span className="sr-only">{textos.abrirAtendimento}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const etapa = lead.etapaAtendimentoId
              ? etapaPorId.get(lead.etapaAtendimentoId)
              : undefined;
            const nomeDoAtendente = lead.atendenteResponsavelId
              ? nomePorAtendenteId.get(lead.atendenteResponsavelId)
              : undefined;
            const abrindo = abrindoLeadId === lead.id;
            return (
              <tr
                key={lead.id}
                className="cursor-pointer border-t border-border hover:bg-muted/50"
                onClick={layoutV2 ? undefined : () => onAbrirFicha(lead)}
                onDoubleClick={layoutV2 && onAbrirAtendimento && abrindoLeadId == null
                  ? () => onAbrirAtendimento(lead) : undefined}
              >
                <td className="px-5 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AvatarIniciais
                      id={lead.id}
                      nome={lead.nome}
                      fotoUrl={lead.fotoUrl}
                      className={`flex size-10 shrink-0 items-center justify-center text-xs font-bold text-primary-foreground ${layoutV2 ? "rounded-full" : "rounded-lg"}`}
                    />
                    <div className="min-w-0">
                      {layoutV2 ? <button type="button" className="block max-w-full truncate text-left font-semibold text-foreground"
                        onClick={() => onAbrirFicha(lead)}>{lead.nome}</button> : <p className="truncate font-bold text-foreground">
                        {lead.nome}
                      </p>}
                      {lead.empresa && (
                        <p className="truncate text-xs text-muted-foreground">
                          {lead.empresa}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                  {lead.telefone ?? "—"}
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {lead.localizacao ?? "—"}
                </td>
                <td className="px-5 py-3">
                  {etapa ? (
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-bold"
                      style={
                        etapa.corVisual
                          ? {
                              backgroundColor: `${etapa.corVisual}1f`,
                              color: etapa.corVisual,
                            }
                          : undefined
                      }
                    >
                      {etapa.nome}
                    </span>
                  ) : (
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-bold"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${COR_DE_STATUS[lead.status]} 16%, transparent)`,
                        color: COR_DE_STATUS[lead.status],
                      }}
                    >
                      {textos.status[CHAVE_DE_STATUS[lead.status]]}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {lead.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag.tagId}
                        className="rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold"
                        style={{
                          backgroundColor: `${tag.cor}1f`,
                          color: tag.cor,
                        }}
                      >
                        {tag.nome}
                      </span>
                    ))}
                    {lead.tags.length > 2 && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-bold text-muted-foreground">
                        +{lead.tags.length - 2}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {nomeDoAtendente && lead.atendenteResponsavelId ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <AvatarIniciais
                        id={lead.atendenteResponsavelId}
                        nome={nomeDoAtendente}
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-primary-foreground"
                      />
                      <span className="truncate">{nomeDoAtendente}</span>
                    </div>
                  ) : (
                    <span className="italic">{textos.semResponsavel}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">
                  {lead.ultimaInteracaoEm
                    ? <time dateTime={lead.ultimaInteracaoEm} title={dataCompleta.format(new Date(lead.ultimaInteracaoEm))}>
                        {layoutV2 ? ultimoContato(lead.ultimaInteracaoEm, agora) : dataCompleta.format(new Date(lead.ultimaInteracaoEm))}
                      </time>
                    : "—"}
                </td>
                <td className="px-5 py-3 text-right">
                  {onAbrirAtendimento && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-slot="agenda-atender"
                      className="rounded-lg"
                      disabled={abrindoLeadId != null}
                      aria-busy={abrindo}
                      onClick={(evento) => {
                        evento.stopPropagation();
                        onAbrirAtendimento(lead);
                      }}
                      onDoubleClick={(evento) => evento.stopPropagation()}
                    >
                      <MessageSquare className="mr-1.5 size-(--tamanho-icone-interface)" aria-hidden />
                      {abrindo ? textos.abrindoAtendimento : layoutV2 ? textos.v2.atender : textos.abrirAtendimento}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
