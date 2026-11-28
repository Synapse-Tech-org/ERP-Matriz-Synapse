"use client";

import { useId } from "react";
import { Headset, Lock, MessagesSquare, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { ehAcessoDeConversa, normalizar, type Simulacao, type ViolacaoDaDelegacao } from "@/lib/gestao/rascunho";
import type { CapacidadeDoCatalogo, Catalogo, LinhaDeCapacidade } from "@/lib/gestao/types";

import { motivoDoBloqueio, motivoForaDaAlcada, preencher, rotuloDaCapacidade, SeloSensivel, type TextosGestao } from "./apoio";

export function acessosDeConversaVisiveis(catalogo: Catalogo, termo: string, textos: TextosGestao) {
  return catalogo.capacidades.filter((c) => ehAcessoDeConversa(c.id)
    && (!termo || normalizar(`${rotuloDaCapacidade(textos, c.id)} ${descricaoDoAcesso(textos, c.id)} ${c.id}`).includes(termo)));
}

function descricaoDoAcesso(textos: TextosGestao, id: string) {
  return id === "clientes.acessar" ? textos.permissoes.acessosDeConversa.clientes : textos.permissoes.acessosDeConversa.interno;
}

type Props = {
  capacidades: CapacidadeDoCatalogo[];
  gravadas: LinhaDeCapacidade[];
  simulacao: Simulacao;
  editavel: boolean;
  textos: TextosGestao;
  avaliarAcao: (id: string, ligado: boolean) => ViolacaoDaDelegacao | null;
  onAcao: (id: string, ligado: boolean) => void;
  onRestaurarAcao?: (id: string) => (() => void) | undefined;
};

export function AcessosDeConversa({ capacidades, gravadas, simulacao, editavel, textos, avaliarAcao, onAcao, onRestaurarAcao }: Props) {
  const id = useId();
  const presentes = capacidades.filter((c) => gravadas.some((g) => g.id === c.id));
  if (presentes.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {presentes.map((capacidade) => {
        const estado = simulacao.estados[capacidade.id];
        const gravada = gravadas.find((g) => g.id === capacidade.id)!;
        const flagDesligada = gravada.motivo === "FLAG_DESLIGADA";
        const permitido = !flagDesligada && estado.permitido;
        const motivo = motivoDoBloqueio(textos, {
          motivo: flagDesligada ? "FLAG_DESLIGADA" : estado.motivo, alcance: null,
        }, capacidade.nivelMinimo, capacidade.dependencias);
        const violacao = editavel && !motivo ? avaliarAcao(capacidade.id, !permitido) : null;
        const desabilitado = !editavel || motivo !== null || violacao !== null;
        const dica = motivo ?? (violacao ? motivoForaDaAlcada(textos, violacao, capacidade.id) : null);
        const nome = rotuloDaCapacidade(textos, capacidade.id);
        const descricaoId = `${id}-${capacidade.id}`;
        const restaurar = onRestaurarAcao?.(capacidade.id);
        const Icone = capacidade.id === "clientes.acessar" ? Headset : MessagesSquare;

        return (
          <div key={capacidade.id} className="space-y-2.5 rounded-xl border border-border bg-card p-3.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <Icone className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                  {nome} {capacidade.sensivel && <SeloSensivel textos={textos} />}
                </p>
                <p id={descricaoId} className="mt-1 text-xs text-muted-foreground">{descricaoDoAcesso(textos, capacidade.id)}</p>
              </div>
              {restaurar && (
                <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-cor-atencao"
                  aria-label={preencher(textos.excecoes.restaurar, { acao: nome })}
                  title={preencher(textos.excecoes.restaurar, { acao: nome })} onClick={restaurar}>
                  <RotateCcw className="size-4" aria-hidden />
                </Button>
              )}
            </div>
            <RadioGroup aria-label={nome} aria-describedby={dica ? `${descricaoId} ${descricaoId}-bloqueio` : descricaoId}
              className="grid grid-cols-2" value={permitido ? "COM_ACESSO" : "SEM_ACESSO"} disabled={desabilitado}
              onValueChange={(valor) => { if (!desabilitado) onAcao(capacidade.id, valor === "COM_ACESSO"); }}>
              <RadioItem value="COM_ACESSO" className="px-2 py-1.5 text-xs data-disabled:cursor-default data-disabled:opacity-60">
                {textos.permissoes.acessosDeConversa.comAcesso}
              </RadioItem>
              <RadioItem value="SEM_ACESSO" className="px-2 py-1.5 text-xs data-disabled:cursor-default data-disabled:opacity-60">
                {textos.permissoes.niveis.SEM_ACESSO}
              </RadioItem>
            </RadioGroup>
            {dica && (
              <p id={`${descricaoId}-bloqueio`} className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3 shrink-0" aria-hidden />{dica}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
