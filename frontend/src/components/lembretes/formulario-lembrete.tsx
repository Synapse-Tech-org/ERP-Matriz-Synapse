"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { AtalhosDeHorario } from "@/components/shell/atalhos-de-horario";
import { Button } from "@/components/ui/button";
import visual from "@/components/shell/agenda-recursos-v2.module.css";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { dataHoraCompleta, SeletorDataHora } from "@/components/ui/seletor-data-hora";
import { Seletor } from "@/components/ui/seletor";
import { Textarea } from "@/components/ui/textarea";
import { useAtendimentosParaEscolha } from "@/lib/atendimento/use-atendimentos";
import { useTextos } from "@/lib/config/textos-provider";
import { criarLembrete, editarLembrete } from "@/lib/suporte/api";
import type { Lembrete } from "@/lib/suporte/types";

interface Props {
  aberto: boolean; visualV2?: boolean;
  leadId?: string;
  leadNome?: string;
  existente?: Lembrete;
  onFechar: () => void;
}

function paraLocal(iso: string): string {
  const data = new Date(iso);
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function FormularioLembrete({ aberto, visualV2 = false, leadId, leadNome, existente, onFechar }: Props) {
  const textos = useTextos().lembretes;
  const cache = useQueryClient();
  const [leadSelecionado, setLeadSelecionado] = useState(leadId ?? existente?.leadId ?? "");
  const [texto, setTexto] = useState(existente?.texto ?? "");
  const [dataHora, setDataHora] = useState(
    existente ? paraLocal(existente.dataHora) : "",
  );
  const atendimentos = useAtendimentosParaEscolha(aberto && !leadId && !existente);
  const leads = useMemo(() => {
    const unicos = new Map((atendimentos.data ?? []).map((item) => [item.leadId, item.leadNome]));
    return [...unicos.entries()];
  }, [atendimentos.data]);
  const criar = useMutation({
    mutationFn: (dados: { leadId: string | null; texto: string; dataHora: string }) =>
      existente
        ? editarLembrete(existente.id, {
            texto: dados.texto,
            dataHora: dados.dataHora,
            status: existente.status,
          })
        : criarLembrete(dados),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["lembretes"] });
      setTexto("");
      setDataHora("");
      if (!leadId && !existente) setLeadSelecionado("");
      onFechar();
    },
  });

  const leadEfetivo = leadId ?? leadSelecionado;
  function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if ((!visualV2 && !existente && !leadEfetivo) || !texto.trim() || !dataHoraCompleta(dataHora)) return;
    criar.mutate({ leadId: leadEfetivo || null, texto: texto.trim(), dataHora: new Date(dataHora).toISOString() });
  }

  return (
    <Dialog open={aberto} onOpenChange={(novo) => !novo && onFechar()}>
      <DialogContent className={visualV2 ? visual.formulario : undefined}>
        <DialogHeader><DialogTitle>{existente ? textos.formulario.tituloEditar : textos.formulario.titulo}</DialogTitle>
          {visualV2 && <DialogDescription>{textos.v2.subtituloFormulario}</DialogDescription>}
        </DialogHeader>
        <form className="space-y-3" onSubmit={salvar}>
          {visualV2 && <label className="block space-y-1 text-sm">
            <span>{textos.v2.oQueLembrar}</span>
            <Input placeholder={textos.v2.exemploLembrete} value={texto} onChange={(e) => setTexto(e.target.value)} required />
          </label>}
          <label className="block space-y-1 text-sm">
            <span>{textos.formulario.lead}</span>
            {leadId || existente ? (
              <Input value={leadNome ?? existente?.leadNome ?? leadId ?? ""} disabled />
            ) : (
              <Seletor
                obrigatorio={!visualV2}
                valor={leadSelecionado}
                placeholder={visualV2 ? textos.v2.semLead : textos.formulario.selecionarLead}
                opcoes={leads.map(([id, nome]) => ({ valor: id, rotulo: nome }))}
                onChange={setLeadSelecionado}
              />
            )}
          </label>
          <label className="block space-y-1 text-sm">
            <span>{visualV2 ? textos.v2.quando : textos.formulario.dataHora}</span>
            {visualV2 && <AtalhosDeHorario rotulos={textos.v2} valor={dataHora} onChange={setDataHora} />}
            <SeletorDataHora
              valor={dataHora}
              placeholderData={textos.formulario.selecionarData}
              rotuloHora={textos.formulario.hora}
              rotuloMinuto={textos.formulario.minuto}
              obrigatorio
              onChange={setDataHora}
            />
          </label>
          {!visualV2 && <label className="block space-y-1 text-sm">
            <span>{textos.formulario.texto}</span>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} required />
          </label>}
          {criar.isError && <p role="alert" className="text-sm text-destructive">{textos.formulario.erroOperacao ?? textos.formulario.erro}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>{textos.formulario.cancelar}</Button>
            <Button type="submit" disabled={criar.isPending}>{textos.formulario.salvar}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
