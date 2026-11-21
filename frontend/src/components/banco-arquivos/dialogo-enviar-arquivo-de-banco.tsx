"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File, Search, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErroDeApi } from "@/lib/api/errors";
import { apiFetch } from "@/lib/api/http-client";
import { useAuthStore } from "@/lib/auth/auth-store";
import type { ArquivoDoBanco } from "@/lib/banco-arquivos/api";
import { buscarDestinosDoEncaminhamento } from "@/lib/chat-interno/api";
import { useTextos } from "@/lib/config/textos-provider";

type Props = {
  arquivo: ArquivoDoBanco | null;
  onFechar: () => void;
};

export function DialogoEnviarArquivoDeBanco({ arquivo, onFechar }: Props) {
  if (!arquivo) return null;
  return <Envio key={arquivo.id} arquivo={arquivo} onFechar={onFechar} />;
}

function Envio({ arquivo, onFechar }: { arquivo: ArquivoDoBanco; onFechar: () => void }) {
  const textos = useTextos().bancoArquivosEnvio;
  const cache = useQueryClient();
  const usuario = useAuthStore((estado) => estado.usuarioId);
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [legenda, setLegenda] = useState("");
  const tentativa = useRef<{ destino: string; legenda: string; chave: string } | null>(null);
  const enviando = useRef(false);
  const tipoIncompativel = arquivo.tipo === "DWG";
  const atendimentos = useQuery({
    queryKey: ["banco-arquivos", usuario, "destinos-de-envio", termo],
    enabled: !tipoIncompativel,
    queryFn: () => buscarDestinosDoEncaminhamento(termo),
    retry: false,
  });
  const buscando = termo !== busca.trim() || atendimentos.isPending;
  const encontrados = atendimentos.data ?? [];
  const destino = buscando ? undefined : encontrados.find((atendimento) => atendimento.atendimentoId === destinoId);

  useEffect(() => {
    const timer = window.setTimeout(() => setTermo(busca.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [busca]);

  const envio = useMutation({
    mutationFn: ({ destino, legenda, chave }: NonNullable<typeof tentativa.current>) =>
      apiFetch<{ atendimentoId: string; mensagemId: string }>(`/api/v1/banco-arquivos/${arquivo.id}/enviar`, {
        method: "POST",
        headers: { "Idempotency-Key": chave },
        body: JSON.stringify({ atendimentoId: destino, legenda: legenda || null }),
      }),
    onSuccess: ({ atendimentoId }) => {
      void cache.invalidateQueries({ queryKey: ["atendimentos"] });
      void cache.invalidateQueries({ queryKey: ["mensagens", atendimentoId] });
    },
    onSettled: () => { enviando.current = false; },
  });

  function confirmar() {
    if (!destino || tipoIncompativel || enviando.current) return;
    const legendaLimpa = legenda.trim();
    if (tentativa.current?.destino !== destino.atendimentoId || tentativa.current?.legenda !== legendaLimpa) {
      tentativa.current = { destino: destino.atendimentoId, legenda: legendaLimpa, chave: crypto.randomUUID() };
    }
    enviando.current = true;
    envio.mutate(tentativa.current);
  }

  function fechar() {
    if (!enviando.current) onFechar();
  }

  const erro = envio.error instanceof ErroDeApi ? envio.error : null;
  const mensagemErro = erro?.problema?.motivo === "janela_fechada" ? textos.janelaFechada
    : erro?.status === 413 ? textos.arquivoGrande
    : erro?.status === 429 ? textos.limite
    : erro?.status === 403 ? textos.semPermissao
    : erro?.status === 404 || erro?.status === 409 ? textos.indisponivel
    : textos.erroEnvio;

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
      <DialogContent
        className="flex max-h-[86dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-[540px]"
        overlayClassName="bg-foreground/30 backdrop-blur-sm"
        showCloseButton={false}
      >
        <header className="flex items-start gap-3 px-6 pt-6 pb-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <File className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg tracking-tight">{textos.titulo}</DialogTitle>
            <DialogDescription className="truncate" title={arquivo.nome}>{arquivo.nome}</DialogDescription>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={fechar} aria-label={textos.fechar} disabled={envio.isPending}>
            <X aria-hidden="true" />
          </Button>
        </header>

        {envio.isSuccess ? (
          <p role="status" className="px-6 py-4 text-sm">{textos.enfileirado}</p>
        ) : tipoIncompativel ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">{textos.tipoIncompativel}</p>
        ) : (
          <>
            <div className="relative px-6 pb-3">
              <Search className="pointer-events-none absolute top-3 left-9 size-4 text-muted-foreground" aria-hidden="true" />
              <Input className="h-[42px] rounded-xl pl-9" value={busca} onChange={(evento) => {
                setBusca(evento.target.value);
                setDestinoId(null);
              }} aria-label={textos.busca} placeholder={textos.busca} maxLength={140} disabled={envio.isPending} />
            </div>
            <ul aria-label={textos.busca} className="min-h-0 max-h-64 space-y-1 overflow-y-auto px-4 pb-2">
              {buscando || atendimentos.isError || encontrados.length === 0 ? (
                <li className="px-2 py-3 text-sm text-muted-foreground">
                  {buscando ? textos.carregando : atendimentos.isError ? textos.erroBusca : textos.semAtendimento}
                </li>
              ) : encontrados.map((atendimento) => (
                <li key={atendimento.atendimentoId}>
                  <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-3 rounded-xl py-2 text-left aria-pressed:bg-primary/10"
                    aria-pressed={destinoId === atendimento.atendimentoId} disabled={envio.isPending}
                    onClick={() => setDestinoId(atendimento.atendimentoId)}>
                    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {atendimento.clienteNome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{atendimento.clienteNome}</span>
                      {atendimento.telefoneMascarado && <span className="block truncate text-xs font-normal text-muted-foreground">{atendimento.telefoneMascarado}</span>}
                    </span>
                    <span aria-hidden="true" className="size-4 shrink-0 rounded-full border border-muted-foreground group-aria-pressed/button:border-4 group-aria-pressed/button:border-primary" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="px-6 pt-3">
              <Input className="h-[42px] rounded-xl" value={legenda} onChange={(evento) => setLegenda(evento.target.value)}
                aria-label={textos.legenda} placeholder={textos.legenda} maxLength={1024} disabled={envio.isPending} />
              {envio.isError && <p role="alert" className="mt-2 text-sm text-destructive">{mensagemErro}</p>}
            </div>
          </>
        )}

        <footer className="mt-4 flex justify-end gap-2 border-t bg-muted/50 px-6 py-3.5">
          <Button type="button" variant="outline" onClick={fechar} disabled={envio.isPending}>
            {envio.isSuccess || tipoIncompativel ? textos.fechar : textos.cancelar}
          </Button>
          {!envio.isSuccess && !tipoIncompativel && (
            <Button type="button" onClick={confirmar} disabled={!destino || envio.isPending || atendimentos.isError}>
              <Send className="size-4" aria-hidden="true" /> {envio.isPending ? textos.enviando : textos.enviar}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
