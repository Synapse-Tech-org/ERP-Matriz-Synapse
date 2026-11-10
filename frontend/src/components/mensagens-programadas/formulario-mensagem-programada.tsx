"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AtalhosDeHorario } from "@/components/shell/atalhos-de-horario";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button } from "@/components/ui/button";
import visual from "@/components/shell/agenda-recursos-v2.module.css";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { dataHoraCompleta, SeletorDataHora } from "@/components/ui/seletor-data-hora";
import { Seletor } from "@/components/ui/seletor";
import { Textarea } from "@/components/ui/textarea";
import { useAtendimentosParaEscolha } from "@/lib/atendimento/use-atendimentos";
import { useTextos } from "@/lib/config/textos-provider";
import { criarMensagemProgramada, editarMensagemProgramada } from "@/lib/suporte/api";
import type { MensagemProgramada } from "@/lib/suporte/types";

interface Props { aberto: boolean; visualV2?: boolean; leadId?: string; leadNome?: string; conteudoInicial?: string;
  existente?: MensagemProgramada; titulo?: string; onFechar: () => void; onSalvo?: () => void; }

function paraLocal(iso?: string) { if (!iso) return ""; const d = new Date(iso); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }

export function FormularioMensagemProgramada({ aberto, visualV2 = false, leadId, leadNome, conteudoInicial, existente, titulo, onFechar, onSalvo }: Props) {
  const { formulario: textos, v2 } = useTextos().mensagensProgramadas; const cache = useQueryClient();
  const [leadSelecionado, setLeadSelecionado] = useState(leadId ?? existente?.leadId ?? "");
  const [buscaLead, setBuscaLead] = useState("");
  const [conteudo, setConteudo] = useState(existente?.conteudo ?? conteudoInicial ?? "");
  const [dataEnvio, setDataEnvio] = useState(paraLocal(existente?.dataEnvio));
  const atendimentos = useAtendimentosParaEscolha(aberto && !leadId && !existente);
  const leads = useMemo(() => [...new Map((atendimentos.data ?? []).map((a) => [a.leadId, a])).values()], [atendimentos.data]);
  const termo = buscaLead.trim().toLocaleLowerCase("pt-BR");
  const leadsVisiveis = leads.filter(({ leadNome, leadEmpresa }) =>
    (leadNome + " " + (leadEmpresa ?? "")).toLocaleLowerCase("pt-BR").includes(termo));
  const salvar = useMutation({ mutationFn: () => existente
    ? editarMensagemProgramada(existente.id, { conteudo: conteudo.trim(), dataEnvio: new Date(dataEnvio).toISOString() })
    : criarMensagemProgramada({ leadId: leadId ?? leadSelecionado, conteudo: conteudo.trim(), dataEnvio: new Date(dataEnvio).toISOString() }),
    onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["mensagens-programadas"] }); onSalvo?.(); onFechar(); } });
  return <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}><DialogContent className={visualV2 ? visual.formulario + " " + visual.formularioProgramada : undefined}><DialogHeader><DialogTitle>{titulo ?? (existente ? textos.tituloEditar : textos.tituloCriar)}</DialogTitle>{visualV2 && <DialogDescription>{v2.subtituloFormulario}</DialogDescription>}</DialogHeader>
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if ((leadId ?? leadSelecionado) && conteudo.trim() && dataHoraCompleta(dataEnvio)) salvar.mutate(); }}>
      {visualV2 && !leadId && !existente ? <fieldset className="space-y-2">
        <legend>{textos.lead}</legend>
        <div className={visual.selecaoLeads}>
          <div className={visual.buscaLeadFormulario}>
            <Search aria-hidden className="size-4 shrink-0" />
            <Input aria-label={v2.buscarLeadFormulario} placeholder={v2.buscarLeadFormulario}
              value={buscaLead} onChange={(evento) => setBuscaLead(evento.target.value)} />
          </div>
          <div className={visual.leadsFormulario}>
            {leadsVisiveis.map(({ leadId: id, leadNome: nome, leadEmpresa: empresa }) => <label key={id}>
              <AvatarIniciais id={id} nome={nome} className="grid size-8 shrink-0 place-items-center rounded-full text-xs text-white" />
              <span><strong>{nome}</strong>{empresa && <small>{empresa}</small>}</span>
              <input type="radio" name="lead-programada" value={id} checked={leadSelecionado === id}
                onChange={() => setLeadSelecionado(id)} />
            </label>)}
            {!leadsVisiveis.length && <p>{v2.semLeadsFormulario}</p>}
          </div>
        </div>
      </fieldset> : <label className="block space-y-1 text-sm"><span>{textos.lead}</span>
        {leadId || existente ? <Input disabled value={leadNome ?? existente?.leadNome ?? leadId} /> : <Seletor
          obrigatorio valor={leadSelecionado} placeholder={textos.selecionarLead}
          opcoes={leads.map(({ leadId: id, leadNome: nome }) => ({ valor: id, rotulo: nome }))} onChange={setLeadSelecionado} />}
      </label>}
      {!visualV2 && <label className="block space-y-1 text-sm"><span>{visualV2 ? v2.quando : textos.dataEnvio}</span>{visualV2 && <AtalhosDeHorario agendamento rotulos={v2} valor={dataEnvio} onChange={setDataEnvio} />}<SeletorDataHora valor={dataEnvio} placeholderData={textos.selecionarData} rotuloHora={textos.hora} rotuloMinuto={textos.minuto} obrigatorio onChange={setDataEnvio} /></label>}
      <label className="block space-y-1 text-sm"><span>{textos.conteudo}</span><Textarea required rows={visualV2 ? 4 : undefined} placeholder={visualV2 ? v2.exemploMensagem : undefined} value={conteudo} onChange={(e) => setConteudo(e.target.value)} /></label>
      {visualV2 && <label className="block space-y-1 text-sm"><span>{visualV2 ? v2.quando : textos.dataEnvio}</span>{visualV2 && <AtalhosDeHorario agendamento rotulos={v2} valor={dataEnvio} onChange={setDataEnvio} />}<SeletorDataHora valor={dataEnvio} placeholderData={textos.selecionarData} rotuloHora={textos.hora} rotuloMinuto={textos.minuto} obrigatorio onChange={setDataEnvio} /></label>}
      {salvar.isError && <p role="alert" className="text-sm text-destructive">{textos.erro}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onFechar}>{textos.cancelar}</Button><Button type="submit" disabled={salvar.isPending || (visualV2 && (!(leadId ?? leadSelecionado) || !conteudo.trim() || !dataHoraCompleta(dataEnvio) || new Date(dataEnvio).getTime() <= Date.now()))}>{textos.salvar}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}
