"use client";

import { useState, type ComponentType, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAtualizarParametroAutomacao } from "@/lib/automacao/use-automacao";
import type { ParametroAutomacao } from "@/lib/automacao/types";
import { cn } from "@/lib/utils";

import type { TextosGestao } from "./apoio";

type Textos = TextosGestao["configuracoesGerais"];

/** Cartão de uma seção: cabeçalho com ícone e as linhas de configuração separadas por divisórias. */
export function SecaoConfiguracoes({ icone: Icone, titulo, descricao, children }: {
  icone: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; titulo: string; descricao?: string; children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border bg-card shadow-xs" data-slot="configuracoes-gerais-secao">
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <span className="grid size-9 flex-none place-items-center rounded-xl bg-accent text-accent-foreground">
          <Icone className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-9">{titulo}</h2>
          {descricao && <p className="-mt-1 text-[13px] leading-relaxed text-muted-foreground">{descricao}</p>}
        </div>
      </header>
      <div className="divide-y px-5">{children}</div>
    </section>
  );
}

/**
 * Linha padrão: título e descrição à esquerda, controle à direita; o que depende do controle (ex.: o
 * limite de horas de um interruptor ligado) aparece logo abaixo, num bloco recuado.
 */
export function LinhaConfiguracao({ titulo, descricao, controle, erro, children }: {
  titulo: string; descricao?: string; controle?: ReactNode; erro?: string | null; children?: ReactNode;
}) {
  return (
    <div className="py-4" data-slot="configuracao-linha">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-[1_1_240px]">
          <p className="text-sm font-semibold">{titulo}</p>
          {descricao && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{descricao}</p>}
          {erro && <p role="alert" className="mt-1 text-xs text-destructive">{erro}</p>}
        </div>
        {controle && <div className="flex-none">{controle}</div>}
      </div>
      {children && <div className="mt-3 rounded-xl bg-muted/50 p-3 sm:p-4">{children}</div>}
    </div>
  );
}

/** Liga/desliga salva no clique, como os demais interruptores de configuração do CRM. */
export function LinhaInterruptor({ parametro, titulo, descricao, editavel, textos, children }: {
  parametro: ParametroAutomacao; titulo: string; descricao: string; editavel: boolean; textos: Textos; children?: ReactNode;
}) {
  const atualizar = useAtualizarParametroAutomacao();
  return (
    <LinhaConfiguracao
      titulo={titulo}
      descricao={descricao}
      erro={atualizar.isError ? textos.erroSalvar : null}
      controle={(
        <Switch
          checked={parametro.valor === "true"}
          disabled={!editavel || atualizar.isPending}
          aria-label={titulo}
          onCheckedChange={(valor) => atualizar.mutate({ chave: parametro.chave, valor: String(valor) })}
        />
      )}
    >
      {children}
    </LinhaConfiguracao>
  );
}

/** Valor com botão Salvar: só envia o que mudou e o backend revalida tipo e faixa. */
export function CampoComSalvar({ parametro, rotulo, editavel, textos, tipo = "text", unidade, validar, rotuloOculto = false, className }: {
  parametro: ParametroAutomacao; rotulo: string; editavel: boolean; textos: Textos;
  tipo?: "text" | "number" | "time"; unidade?: string; validar?: (valor: string) => string | null;
  /** Na linha padrão o título já nomeia o campo; o rótulo fica só para leitores de tela. */
  rotuloOculto?: boolean; className?: string;
}) {
  const atualizar = useAtualizarParametroAutomacao();
  const [valor, setValor] = useState(parametro.valor);
  const erro = validar?.(valor) ?? (tipo === "number" ? erroDeFaixa(parametro, valor, textos) : null);
  const alterado = valor !== parametro.valor;
  const id = `config-${parametro.chave}`;
  return (
    <div className={cn("min-w-0", tipo === "text" && "w-full", className)}>
      <label htmlFor={id} className={rotuloOculto ? "sr-only" : "text-xs font-medium text-muted-foreground"}>{rotulo}</label>
      <div className={cn("flex flex-wrap items-center gap-2", !rotuloOculto && "mt-1.5")}>
        <Input
          id={id}
          type={tipo}
          value={valor}
          disabled={!editavel}
          min={tipo === "number" ? parametro.valorMin ?? undefined : undefined}
          max={tipo === "number" ? parametro.valorMax ?? undefined : undefined}
          aria-invalid={erro ? true : undefined}
          onChange={(evento) => setValor(evento.target.value)}
          className={tipo === "text" ? "min-w-0 flex-1" : tipo === "time" ? "w-28" : "w-24 text-right tabular-nums"}
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
