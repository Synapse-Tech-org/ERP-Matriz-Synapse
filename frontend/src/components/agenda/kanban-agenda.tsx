"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Seletor } from "@/components/ui/seletor";
import type { LeadDaAgenda } from "@/lib/agenda/types";
import type { Textos } from "@/lib/config/schema";
import { atualizarLead } from "@/lib/lead/api";
import type { EtapaAtendimento } from "@/lib/lead/types";

import estilos from "./agenda-v2.module.css";

interface Props {
  leads: LeadDaAgenda[];
  etapas: EtapaAtendimento[];
  etapasVisiveis: string[];
  contagemPorEtapa?: ReadonlyMap<string | null, number>;
  podeEditar: boolean;
  textos: Textos["agenda"];
  onAbrirFicha: (lead: LeadDaAgenda) => void;
}

export function KanbanAgenda({ leads, etapas, etapasVisiveis, contagemPorEtapa, podeEditar, textos, onAbrirFicha }: Props) {
  const cache = useQueryClient();
  const movendo = useRef(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const mover = useMutation({
    mutationFn: ({ leadId, etapaId }: { leadId: string; etapaId: string }) =>
      atualizarLead(leadId, { etapaAtendimentoId: etapaId }),
    onSuccess: async (_salvo, { leadId }) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["agenda", "leads"] }),
        cache.invalidateQueries({ queryKey: ["agenda", "contagem-por-etapa"] }),
        cache.invalidateQueries({ queryKey: ["agenda", "contagem"] }),
        cache.invalidateQueries({ queryKey: ["lead", leadId] }),
        cache.invalidateQueries({ queryKey: ["lead", "agenda", leadId] }),
      ]);
    },
    onSettled: () => { movendo.current = false; },
  });
  const etapaPorId = new Map(etapas.map((etapa) => [etapa.id, etapa]));
  const contatosPorEtapa = new Map<string | null, LeadDaAgenda[]>();
  for (const lead of leads) {
    const id = lead.etapaAtendimentoId && etapaPorId.has(lead.etapaAtendimentoId) ? lead.etapaAtendimentoId : null;
    const grupo = contatosPorEtapa.get(id);
    if (grupo) grupo.push(lead);
    else contatosPorEtapa.set(id, [lead]);
  }

  function solicitarMovimento(lead: LeadDaAgenda, etapaId: string) {
    if (!podeEditar || movendo.current || !etapaPorId.has(etapaId) || lead.etapaAtendimentoId === etapaId) return;
    movendo.current = true;
    mover.mutate({ leadId: lead.id, etapaId });
  }

  const colunas = etapas.filter(({ id }) => etapasVisiveis.length === 0 || etapasVisiveis.includes(id));
  return (
    <>
      {mover.isError && <p role="alert" className="px-3 py-2 text-sm text-destructive">{textos.v2.erroMover}</p>}
      <div className={estilos.kanban}>
        {[...colunas, { id: null, nome: textos.v2.semEtapa, corVisual: null }].map((etapa) => {
          const contatos = contatosPorEtapa.get(etapa.id) ?? [];
          const destino = etapa.id;
          if (!destino && contatos.length === 0) return null;
          const podeReceber = Boolean(destino && arrastando && podeEditar && !mover.isPending);
          return (
            <section key={destino} style={{ "--tom-etapa": etapa.corVisual ?? "var(--v2-azul)" } as React.CSSProperties}
              onDragOver={podeReceber ? (evento) => { evento.preventDefault(); evento.dataTransfer.dropEffect = "move"; } : undefined}
              onDrop={podeReceber && destino ? (evento) => {
                evento.preventDefault();
                const id = evento.dataTransfer.getData("application/x-synapse-contato");
                setArrastando(null);
                const contato = leads.find((item) => item.id === id && id === arrastando);
                if (contato) solicitarMovimento(contato, destino);
              } : undefined}>
              <h2>{etapa.nome} {contagemPorEtapa && <span>{contagemPorEtapa.get(destino) ?? 0}</span>}</h2>
              <ul className="space-y-2">
                {contatos.map((lead) => (
                  <li key={lead.id} className={estilos.cartaoKanban} draggable={podeEditar && !mover.isPending}
                    onDragStart={(evento) => {
                      evento.dataTransfer.setData("application/x-synapse-contato", lead.id);
                      evento.dataTransfer.effectAllowed = "move";
                      setArrastando(lead.id);
                    }} onDragEnd={() => setArrastando(null)}>
                    <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => onAbrirFicha(lead)}>
                      <AvatarIniciais id={lead.id} nome={lead.nome} fotoUrl={lead.fotoUrl}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{lead.nome}</span>
                        {lead.empresa && <span className="block truncate text-xs text-muted-foreground">{lead.empresa}</span>}
                      </span>
                    </button>
                    {podeEditar && <Seletor valor="" ariaLabel={textos.v2.moverPara.replace("{nome}", lead.nome)}
                      className="mt-2 w-full text-xs" placeholder={textos.v2.mover}
                      desabilitado={mover.isPending} onChange={(valor) => solicitarMovimento(lead, valor)}
                      opcoes={etapas.filter(({ id }) => id !== lead.etapaAtendimentoId)
                        .map(({ id, nome }) => ({ valor: id, rotulo: nome }))} />}
                  </li>
                ))}
              </ul>
              {contatos.length === 0 && <p>{textos.vazia}</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
