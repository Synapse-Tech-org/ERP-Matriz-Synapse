"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAtualizarParametroAutomacao } from "@/lib/automacao/use-automacao";
import type { ParametroAutomacao } from "@/lib/automacao/types";

import type { TextosGestao } from "./apoio";

type Textos = TextosGestao["configuracoesGerais"];

export function SecaoConfiguracoes({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6" data-slot="configuracoes-gerais-secao">
      <h2 className="text-base font-bold">{titulo}</h2>
      {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      <div className="mt-4 divide-y">{children}</div>
    </section>
  );
}

/** Liga/desliga salva no clique, como os demais interruptores de configuração do CRM. */
export function LinhaInterruptor({ parametro, titulo, descricao, editavel, textos, children }: {
  parametro: ParametroAutomacao; titulo: string; descricao: string; editavel: boolean; textos: Textos; children?: ReactNode;
}) {
  const atualizar = useAtualizarParametroAutomacao();
  const ligado = parametro.valor === "true";
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{descricao}</p>
          {atualizar.isError && <p role="alert" className="mt-1 text-xs text-destructive">{textos.erroSalvar}</p>}
        </div>
        <Switch
          checked={ligado}
          disabled={!editavel || atualizar.isPending}
          aria-label={titulo}
          onCheckedChange={(valor) => atualizar.mutate({ chave: parametro.chave, valor: String(valor) })}
        />
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Valor com botão Salvar: só envia o que mudou e o backend revalida tipo e faixa. */
export function CampoComSalvar({ parametro, rotulo, editavel, textos, tipo = "text", unidade, validar, className }: {
  parametro: ParametroAutomacao; rotulo: string; editavel: boolean; textos: Textos;
  tipo?: "text" | "number" | "time"; unidade?: string; validar?: (valor: string) => string | null; className?: string;
}) {
  const atualizar = useAtualizarParametroAutomacao();
  const [valor, setValor] = useState(parametro.valor);
  const erro = validar?.(valor) ?? (tipo === "number" ? erroDeFaixa(parametro, valor, textos) : null);
  const alterado = valor !== parametro.valor;
  const id = `config-${parametro.chave}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{rotulo}</label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Input
          id={id}
          type={tipo}
          value={valor}
          disabled={!editavel}
          min={tipo === "number" ? parametro.valorMin ?? undefined : undefined}
          max={tipo === "number" ? parametro.valorMax ?? undefined : undefined}
          aria-invalid={erro ? true : undefined}
          onChange={(evento) => setValor(evento.target.value)}
          className={tipo === "text" ? "min-w-0 flex-1" : "w-32"}
        />
        {unidade && <span className="text-sm text-muted-foreground">{unidade}</span>}
        {editavel && alterado && (
          <Button size="sm" disabled={Boolean(erro) || atualizar.isPending} onClick={() => atualizar.mutate({ chave: parametro.chave, valor: valor.trim() })}>
            {atualizar.isPending ? textos.salvando : textos.salvar}
          </Button>
        )}
      </div>
      {erro && <p role="alert" className="mt-1 text-xs text-destructive">{erro}</p>}
      {atualizar.isError && <p role="alert" className="mt-1 text-xs text-destructive">{textos.erroSalvar}</p>}
    </div>
  );
}

function erroDeFaixa(parametro: ParametroAutomacao, valor: string, textos: Textos): string | null {
  const numero = Number(valor);
  const min = parametro.valorMin;
  const max = parametro.valorMax;
  const fora = valor.trim() === "" || !Number.isInteger(numero) || (min != null && numero < min) || (max != null && numero > max);
  if (!fora) return null;
  return textos.erroFaixa.replace("{min}", String(min ?? 1)).replace("{max}", String(max ?? "—"));
}
