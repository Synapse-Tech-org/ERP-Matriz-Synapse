"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, KeyRound, MessageSquareText, ShieldCheck } from "lucide-react";

import visual from "@/components/shell/agenda-recursos-v2.module.css";
import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import listaV2 from "@/components/shell/lista-v2.module.css";
import { Badge } from "@/components/ui/badge";
import { useTextos } from "@/lib/config/textos-provider";
import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";
import { cn } from "@/lib/utils";

import estilosV2 from "./administracao-v2.module.css";

const ABAS = [
  { chave: "visaoGeral", rota: "/administracao", icone: Activity, exata: true },
  { chave: "acessos", rota: "/administracao/acessos", icone: KeyRound, exata: false },
  { chave: "feedbacks", rota: "/administracao/feedbacks", icone: MessageSquareText, exata: false },
] as const;

export function LayoutAdministracao({ children }: { children: React.ReactNode }) {
  const catalogo = useTextos();
  const textos = catalogo.administracao;
  const pathname = usePathname();
  const layoutV2 = useFuncionalidadesHabilitadas().data?.includes("gestao_layout_v2") ?? false;
  const estaAtiva = (aba: (typeof ABAS)[number]) => (aba.exata ? pathname === aba.rota : pathname.startsWith(aba.rota));

  if (layoutV2) {
    const abaAtual = ABAS.find(estaAtiva) ?? ABAS[0];
    return (
      <main data-layout="v2" className={cn(listaV2.pagina, listaV2.modulo, visual.paleta, estilosV2.raiz)}>
        <CabecalhoListaV2
          titulo={textos.abas[abaAtual.chave]}
          grupo={catalogo.menu.grupoGestao}
          trilha={[textos.titulo]}
          extra={<span className={estilosV2.estado}>{textos.estadoSistema}</span>}
        />
        <header>
          <div>
            <h1>{textos.titulo}</h1>
            <p className="text-sm text-muted-foreground">{textos.descricao}</p>
          </div>
          <nav aria-label={textos.navegacao} className={estilosV2.abas}>
            <ul>
              {ABAS.map((aba) => {
                const Icone = aba.icone;
                return (
                  <li key={aba.chave}>
                    <Link href={aba.rota} aria-current={estaAtiva(aba) ? "page" : undefined}>
                      <Icone aria-hidden />{textos.abas[aba.chave]}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </header>
        <div className={estilosV2.conteudo}>{children}</div>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-full min-w-0 flex-col overflow-x-hidden bg-[var(--fundo-canvas)]">
      <header className="shrink-0 border-b border-border bg-card px-5 py-3.5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cor-ia text-white shadow-md"
              aria-hidden
            >
              <ShieldCheck className="size-[calc(var(--tamanho-icone-interface)*1.25)]" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-foreground">{textos.titulo}</h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{textos.descricao}</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-2 rounded-xl px-3 py-2">
            <span className="size-2 rounded-full bg-muted-foreground" aria-hidden />
            {textos.estadoSistema}
          </Badge>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
        <nav
          aria-label={textos.navegacao}
          className="shrink-0 overflow-x-auto overscroll-x-contain border-b border-border bg-card px-2 sm:w-[266px] sm:overflow-x-hidden sm:self-stretch sm:border-r sm:border-b-0 sm:px-3.5 sm:py-5"
        >
          <ul className="flex gap-1 sm:flex-col">
            {ABAS.map((aba) => {
              const ativa = estaAtiva(aba);
              const Icone = aba.icone;
              return (
                <li key={aba.chave} className="shrink-0">
                  <Link
                    href={aba.rota}
                    aria-current={ativa ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-2 py-2.5 text-xs font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cor-ia sm:gap-3 sm:px-3 sm:py-3 sm:text-sm",
                      ativa
                        ? "bg-cor-ia/10 text-cor-ia"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <Icone className="size-(--tamanho-icone-interface) shrink-0 sm:size-[calc(var(--tamanho-icone-interface)*1.25)]" aria-hidden />
                    <span className="flex min-w-0 flex-col">
                      <span>{textos.abas[aba.chave]}</span>
                      <span
                        className={cn(
                          "hidden text-[11.5px] font-medium sm:block",
                          ativa ? "text-cor-ia/70" : "text-muted-foreground",
                        )}
                      >
                        {textos.abasDescricoes[aba.chave]}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 overflow-x-hidden p-5 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
