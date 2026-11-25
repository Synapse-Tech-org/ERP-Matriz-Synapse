"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Seletor } from "@/components/ui/seletor";
import { dataHoraCompleta, SeletorDataHora } from "@/components/ui/seletor-data-hora";
import { apiFetch } from "@/lib/api/http-client";
import type { StatusPresenca } from "@/lib/equipe/types";
import type { TextosGestao } from "./apoio";

type Textos = TextosGestao["presencaOperacional"];
const ajustes = ["ONLINE", "OFFLINE", "PAUSA"] as const;
type Ajuste = typeof ajustes[number];

interface Situacao {
  fuso: string;
  presenca: {
    presencaNoCrm: StatusPresenca;
    statusEfetivo: StatusPresenca | "PAUSA";
    ajuste: Ajuste | null;
    validoAte: string | null;
    disponivelParaIa: boolean;
    motivoRodizio: keyof Textos["motivos"];
    podeAlterar: boolean;
  };
}

export function PainelPresencaOperacional({ usuarioId, textos, disponivelParaIa }: {
  usuarioId: string;
  textos: Textos;
  disponivelParaIa: boolean;
}) {
  const cache = useQueryClient();
  const chave = ["equipe", "status-operacional", usuarioId, disponivelParaIa] as const;
  const rota = `/api/v1/usuarios/${encodeURIComponent(usuarioId)}/status-operacional`;
  const consulta = useQuery({ queryKey: chave, queryFn: ({ signal }) => apiFetch<Situacao>(rota, { signal }) });
  const [editando, setEditando] = useState(false);
  const [status, setStatus] = useState("");
  const [validade, setValidade] = useState("");
  const alterar = useMutation({
    mutationFn: () => apiFetch<Situacao>(rota, {
      method: "PATCH", body: JSON.stringify({ status, validoAte: validade }),
    }),
    onMutate: () => cache.cancelQueries({ queryKey: chave, exact: true }),
    onSuccess: (resultado) => {
      cache.setQueryData(chave, resultado);
      setEditando(false);
    },
  });
  const { data, refetch } = consulta;
  const ate = data?.presenca.validoAte;
  useEffect(() => {
    if (!ate) return;
    const espera = Date.parse(ate) - Date.now();
    if (espera > 2_147_483_647) return;
    const timer = window.setTimeout(() => void refetch(), Math.max(espera, 0) + 100);
    return () => window.clearTimeout(timer);
  }, [ate, refetch]);

  if (consulta.isError) return <div role="alert">
    {textos.erro} <Button variant="ghost" onClick={() => void refetch()}>{textos.tentar}</Button>
  </div>;
  if (!data) return <p role="status">{textos.carregando}</p>;

  const { presenca, fuso } = data;
  const rotuloValidade = textos.validade.replace("{fuso}", fuso);
  return (
    <section aria-label={textos.titulo} className="space-y-3 rounded-md border border-border p-4">
      <h3 className="font-semibold">{textos.titulo}</h3>
      <dl className="grid gap-1 text-sm">
        <div><dt className="inline font-medium">{textos.efetivo}: </dt><dd className="inline">{textos.estados[presenca.statusEfetivo]}</dd></div>
        <div><dt className="inline font-medium">{textos.crm}: </dt><dd className="inline">{textos.estados[presenca.presencaNoCrm]}</dd></div>
        <div><dt className="inline font-medium">{textos.liberacao}: </dt><dd className="inline">{presenca.disponivelParaIa ? textos.ligada : textos.desligada}</dd></div>
        <div><dt className="inline font-medium">{textos.motivo}: </dt><dd className="inline">{textos.motivos[presenca.motivoRodizio]}</dd></div>
        {ate && <div><dt className="inline font-medium">{rotuloValidade}: </dt><dd className="inline">
          <time dateTime={ate}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: fuso }).format(new Date(ate))}</time>
        </dd></div>}
      </dl>
      {presenca.ajuste === "ONLINE" && <p className="text-sm">{textos.onlineManual}</p>}
      {presenca.podeAlterar && (editando ? (
        <form className="grid gap-3" onSubmit={(evento) => {
          evento.preventDefault();
          if (!alterar.isPending && status && dataHoraCompleta(validade)) alterar.mutate();
        }}>
          <Seletor valor={status} onChange={setStatus} placeholder={textos.status} ariaLabel={textos.status}
            opcoes={ajustes.map((valor) => ({ valor, rotulo: textos.estados[valor] }))} desabilitado={alterar.isPending} />
          {status === "ONLINE" && <p className="text-sm">{textos.onlineManual}</p>}
          <fieldset className="min-w-0 space-y-2 text-sm" disabled={alterar.isPending}>
            <legend>{rotuloValidade}</legend>
            <SeletorDataHora valor={validade} onChange={setValidade} placeholderData={textos.data}
              rotuloHora={textos.hora} rotuloMinuto={textos.minuto} obrigatorio
              className="grid-cols-2 [&>*:first-child]:col-span-2" />
          </fieldset>
          {alterar.isError && <p role="alert" className="text-sm text-destructive">{textos.erroSalvar}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={alterar.isPending} onClick={() => setEditando(false)}>{textos.cancelar}</Button>
            <Button type="submit" disabled={alterar.isPending || !status || !dataHoraCompleta(validade)}>{alterar.isPending ? textos.salvando : textos.salvar}</Button>
          </div>
        </form>
      ) : <Button variant="outline" onClick={() => { alterar.reset(); setStatus(""); setValidade(""); setEditando(true); }}>{textos.alterar}</Button>)}
    </section>
  );
}
