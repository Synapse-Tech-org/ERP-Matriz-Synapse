"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { filtrarLeads } from "@/lib/agenda/api";
import { FILTROS_RAPIDOS_VAZIOS } from "@/lib/agenda/types";
import { criterioDosFiltrosAtivos } from "@/lib/agenda/use-agenda";
import { useTextos } from "@/lib/config/textos-provider";
import { useMinhasPermissoes } from "@/lib/gestao/use-gestao";

import { IconeDashboardV2 } from "./icone-dashboard-v2";

const PainelLateralLead = dynamic(() =>
  import("@/components/leads/painel-lateral-lead").then((modulo) => modulo.PainelLateralLead),
);
const TAMANHO_DA_BUSCA = 10;

export function BuscaDoDashboard() {
  const { data } = useMinhasPermissoes();
  return data?.capacidades["clientes.acessar"]?.permitido === true ? <BuscaAutorizada /> : null;
}

function BuscaAutorizada() {
  const textos = useTextos();
  const busca = textos.dashboard.v2.busca;
  const gatilho = useRef<HTMLButtonElement>(null);
  const [aberta, setAberta] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);

  useEffect(() => {
    function abrirPeloAtalho(evento: KeyboardEvent) {
      if (evento.defaultPrevented || evento.repeat || evento.altKey || evento.shiftKey) return;
      if (!(evento.ctrlKey || evento.metaKey) || evento.key.toLowerCase() !== "k") return;
      if (evento.target instanceof Element && evento.target.closest('[role="dialog"]')) return;

      evento.preventDefault();
      gatilho.current?.focus();
      setLeadId(null);
      setAberta(true);
    }
    window.addEventListener("keydown", abrirPeloAtalho);
    return () => window.removeEventListener("keydown", abrirPeloAtalho);
  }, []);

  return (
    <>
      <Dialog open={aberta} onOpenChange={(abriu) => {
        if (abriu) setLeadId(null);
        setAberta(abriu);
      }}>
        <DialogTrigger
          ref={gatilho}
          data-slot="dashboard-busca"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <IconeDashboardV2 nome="search-line" />
          <span>{busca.rotulo}</span>
          <kbd aria-hidden="true">{busca.atalho}</kbd>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          <DialogHeader className="pr-10">
            <DialogTitle>{busca.rotulo}</DialogTitle>
            <DialogDescription>{busca.descricao}</DialogDescription>
          </DialogHeader>
          {aberta && (
            <PesquisaDeContatos onSelecionar={(id) => {
              setLeadId(id);
              setAberta(false);
            }} />
          )}
          <DialogClose
            aria-label={textos.painelLead.fechar}
            render={<Button type="button" size="icon-sm" variant="ghost" className="absolute top-2 right-2" />}
          >
            <X aria-hidden="true" />
          </DialogClose>
        </DialogContent>
      </Dialog>
      {leadId && (
        <PainelLateralLead
          leadId={leadId}
          contexto="agenda"
          onFechar={() => {
            setLeadId(null);
            gatilho.current?.focus();
          }}
        />
      )}
    </>
  );
}

function PesquisaDeContatos({ onSelecionar }: { onSelecionar: (leadId: string) => void }) {
  const textos = useTextos();
  const busca = textos.dashboard.v2.busca;
  const [entrada, setEntrada] = useState("");
  const [termo, setTermo] = useState("");
  const digitado = entrada.trim();
  const pesquisaAtiva = termo.length > 0;
  const consulta = useQuery({
    queryKey: ["agenda", "busca-dashboard", termo],
    enabled: pesquisaAtiva,
    queryFn: ({ signal }) => filtrarLeads(
      criterioDosFiltrosAtivos({ ...FILTROS_RAPIDOS_VAZIOS, busca: termo }, [], []),
      0,
      TAMANHO_DA_BUSCA,
      signal,
    ),
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  function pesquisar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!digitado) return;
    if (digitado === termo) void consulta.refetch();
    else setTermo(digitado);
  }

  const resultados = pesquisaAtiva && consulta.isSuccess ? consulta.data : undefined;
  return (
    <>
      <form className="flex items-center gap-2" onSubmit={pesquisar}>
        <Input
          type="search"
          value={entrada}
          onChange={(evento) => {
            setEntrada(evento.target.value);
            setTermo("");
          }}
          aria-label={busca.rotulo}
          placeholder={busca.rotulo}
          autoComplete="off"
        />
        <Button type="submit" disabled={!digitado || (pesquisaAtiva && consulta.isFetching)}>{busca.acao}</Button>
      </form>
      {pesquisaAtiva && consulta.isFetching && (
        <p role="status" className="text-muted-foreground">{textos.agenda.carregando}</p>
      )}
      {pesquisaAtiva && consulta.isError && (
        <p role="alert" className="text-destructive">{textos.agenda.erro}</p>
      )}
      {resultados?.leads.length === 0 && <p role="status" className="text-muted-foreground">{busca.vazio}</p>}
      {resultados && resultados.leads.length > 0 && (
        <ul className="max-h-60 space-y-1 overflow-y-auto">
          {resultados.leads.map((lead) => (
            <li key={lead.id}>
              <button
                type="button"
                className="grid w-full gap-1 rounded-lg px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => onSelecionar(lead.id)}
              >
                <span className="break-words font-medium">{lead.nome}</span>
                {lead.empresa && <span className="break-words text-xs text-muted-foreground">{lead.empresa}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {resultados?.temMais && <p className="text-xs text-muted-foreground">{busca.mais}</p>}
    </>
  );
}
