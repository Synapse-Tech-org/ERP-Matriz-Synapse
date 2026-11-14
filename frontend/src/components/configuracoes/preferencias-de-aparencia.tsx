"use client";

import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import lista from "@/components/shell/lista-v2.module.css";
import { cores, tamanhos, temas, usePreferenciasAparencia } from "@/lib/config/preferencias-aparencia";
import { useTextos } from "@/lib/config/textos-provider";

export function PreferenciasDeAparencia() {
  const { aparencia: t } = useTextos().configuracoes;
  const { tema, cor, tamanho } = usePreferenciasAparencia();
  if (!t) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader><CardTitle>{t.titulo}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t.tema}</legend>
          <div className="grid grid-cols-3 gap-2">
            {temas.map((opcao) => (
              <button key={opcao} type="button" aria-pressed={tema.valor === opcao}
                onClick={() => tema.definir(opcao)}
                className="rounded-xl border p-2 text-start text-sm aria-pressed:border-primary aria-pressed:bg-accent">
                <span aria-hidden className="previa-de-tema mb-2 block h-16 rounded-lg border p-3" data-tema={opcao}>
                  <span className="block h-2 w-1/2 rounded-full" />
                  <span className="mt-2 block h-5 rounded-md border" />
                </span>
                {t.temas[opcao]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t.cor}</legend>
          <div className="flex flex-wrap gap-3">
            {cores.map((opcao) => (
              <button key={opcao} type="button" data-cor-destaque={opcao} aria-pressed={cor.valor === opcao}
                aria-label={t.cores[opcao]} title={t.cores[opcao]} onClick={() => cor.definir(opcao)}
                className="grid size-9 place-items-center rounded-full bg-[var(--cor-destaque)] text-white aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2">
                {cor.valor === opcao && <Check className="size-4" aria-hidden />}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t.tamanho}</legend>
          <div className={lista.opcoes}>
            {tamanhos.map((opcao) => (
              <button key={opcao} type="button" aria-pressed={tamanho.valor === opcao}
                onClick={() => tamanho.definir(opcao)}>{t.tamanhos[opcao]}</button>
            ))}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
