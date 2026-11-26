"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTextos } from "@/lib/config/textos-provider";
import { useSalvarTelefoneLead } from "@/lib/lead/use-painel-lead";
import { ErroDeApi } from "@/lib/api/errors";
import { buscarAtendimentoPorTelefone } from "@/lib/atendimento/api";

type Props = {
  leadId: string;
  telefone: string | null;
  contexto?: "padrao" | "agenda";
  permitido: boolean;
};

/** Edição explícita do destino de mensagens, compartilhada pelas fichas do chat e da Agenda. */
export function EditorTelefoneDoLead({
  leadId,
  telefone,
  contexto = "padrao",
  permitido,
}: Props) {
  const textosPainel = useTextos().painelLead;
  const textos = textosPainel.dados;
  const salvar = useSalvarTelefoneLead(leadId, contexto);
  const idCampo = useId();
  const [aberto, setAberto] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState("");
  const [erro, setErro] = useState<"invalido" | "salvar" | "indisponivel" | "permissao" | "ausente" | null>(null);
  const enviando = useRef(false);
  const telefoneEmConflito = aberto && erro === "indisponivel" ? novoTelefone.trim() : null;
  const conflito = useQuery({
    queryKey: ["editar-telefone", "conflito", telefoneEmConflito],
    queryFn: () => buscarAtendimentoPorTelefone(telefoneEmConflito!),
    enabled: telefoneEmConflito !== null,
    retry: false,
    gcTime: 0,
  });
  const cartao = telefoneEmConflito && !conflito.isFetching && !conflito.isError ? conflito.data : null;
  const atendimentoEmConflito = cartao && cartao.leadId !== leadId
    ? cartao.atendimentoAtivoId ?? cartao.atendimentoId
    : null;

  if (!permitido) return null;

  function abrir() {
    setNovoTelefone(telefone ?? "");
    setErro(null);
    setAberto(true);
  }

  function confirmar() {
    if (enviando.current || salvar.isPending) return;
    if (novoTelefone.replace(/\D/g, "").length < 10) {
      setErro("invalido");
      return;
    }
    setErro(null);
    enviando.current = true;
    salvar.mutate(
      novoTelefone.trim(),
      {
        onError: (falha) => {
          enviando.current = false;
          if (falha instanceof ErroDeApi) {
            if (falha.status === 409 && falha.problema?.codigo === "TELEFONE_INDISPONIVEL") {
              setErro("indisponivel"); return;
            }
            if (falha.status === 400 && falha.problema?.codigo === "TELEFONE_INVALIDO") {
              setErro("invalido"); return;
            }
            if (falha.status === 403) { setErro("permissao"); return; }
            if (falha.status === 404) { setErro("ausente"); return; }
          }
          setErro("salvar");
        },
        onSuccess: () => { enviando.current = false; setAberto(false); },
      },
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={textos.editarTelefone}
        title={textos.editarTelefone}
        onClick={abrir}
      >
        <Pencil className="size-(--tamanho-icone-interface)" aria-hidden />
      </Button>
      <Dialog open={aberto} onOpenChange={(novo) => !novo && !salvar.isPending && setAberto(false)}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{textos.editarTelefone}</DialogTitle>
            <DialogDescription>{textos.avisoAlteracaoTelefone}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor={idCampo} className="text-sm font-medium text-foreground">
              {textos.novoTelefone}
            </label>
            <Input
              id={idCampo}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={30}
              value={novoTelefone}
              disabled={salvar.isPending}
              aria-invalid={erro === "invalido" || undefined}
              onChange={(evento) => {
                setNovoTelefone(evento.target.value);
                setErro(null);
              }}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") confirmar();
              }}
            />
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {{ invalido: textos.telefoneInvalido, salvar: textos.erroAlteracaoTelefone,
                  indisponivel: textos.telefoneIndisponivel, permissao: textos.telefoneSemPermissao,
                  ausente: textos.telefoneNaoEncontrado }[erro]}
              </p>
            )}
            {atendimentoEmConflito && (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/atendimentos?atendimentoId=${encodeURIComponent(atendimentoEmConflito)}`}
                onClick={() => setAberto(false)}
              >
                {textos.abrirAtendimentoTelefoneEmUso}
              </Link>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={salvar.isPending}
              onClick={() => setAberto(false)}
            >
              {textos.cancelarAlteracaoTelefone}
            </Button>
            <Button type="button" disabled={salvar.isPending} onClick={confirmar}>
              {salvar.isPending ? textosPainel.edicao.salvando : textos.confirmarAlteracaoTelefone}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
