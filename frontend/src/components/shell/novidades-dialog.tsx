import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTextos } from "@/lib/config/textos-provider";
import { Sparkles, Megaphone, Brain, BarChart, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { PillDeStatus } from "@/components/ui/pill-de-status";
import { Badge } from "@/components/ui/badge";

interface NovidadesDialogProps {
  aberto: boolean;
  onFechar: () => void;
}

const ICONES: Record<string, React.ElementType> = {
  megaphone: Megaphone,
  brain: Brain,
  "bar-chart": BarChart,
  smartphone: Smartphone,
};

export function NovidadesDialog({ aberto, onFechar }: NovidadesDialogProps) {
  const textos = useTextos();
  const n = textos.novidades;
  const [aba, setAba] = useState<"novidades" | "embreve">("novidades");

  if (!n) return null;

  // Agrupa novidades por data
  const agrupadasPorData = n.itensNovidades.reduce((acc, item) => {
    if (!acc[item.data]) {
      acc[item.data] = [];
    }
    acc[item.data].push(item);
    return acc;
  }, {} as Record<string, typeof n.itensNovidades>);

  const datasOrdenadas = Object.keys(agrupadasPorData).sort((a, b) => b.localeCompare(a));

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-[840px] max-h-[85dvh] overflow-hidden flex flex-col gap-0 rounded-3xl p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-2xl tracking-tight">{n.titulo}</DialogTitle>
          <DialogDescription>
            {aba === "novidades" ? n.subtituloNovidades : n.subtituloEmBreve}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 px-6 shrink-0 border-b" role="tablist" aria-label={n.titulo}>
          <button
            role="tab"
            aria-selected={aba === "novidades"}
            aria-controls="panel-novidades"
            onClick={() => setAba("novidades")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              aba === "novidades" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {n.abas.novidades}
          </button>
          <button
            role="tab"
            aria-selected={aba === "embreve"}
            aria-controls="panel-embreve"
            onClick={() => setAba("embreve")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              aba === "novidades" ? "border-transparent text-muted-foreground hover:text-foreground" : "border-primary text-primary"
            )}
          >
            {n.abas.embreve}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-5 sm:p-7">
          {aba === "novidades" && (
            <div id="panel-novidades" role="tabpanel" className="flex flex-col gap-6">
              {datasOrdenadas.map(data => (
                <div key={data} className="space-y-4">
                  <h3 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground after:h-px after:flex-1 after:bg-border">{
                    new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(data + "T12:00:00"))
                  }</h3>
                  <div className="flex flex-col gap-3">
                    {agrupadasPorData[data].map((item, i) => (
                      <article key={i} className={cn("flex items-start gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5", item.novo && "border-cor-sucesso/20 bg-cor-sucesso/5")}>
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Sparkles className="size-[calc(var(--tamanho-icone-interface)*1.25)]" />
                        </div>
                        <div>
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <h4 className="text-[1.0625rem] font-semibold tracking-tight">{item.titulo}</h4>
                            {item.novo && n.novoTag && (
                              <Badge className="h-5 border-none bg-cor-sucesso/10 px-2 text-[10px] font-semibold text-cor-sucesso">{n.novoTag}</Badge>
                            )}
                          </div>
                          <p className="text-sm leading-relaxed text-muted-foreground">{item.descricao}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {aba === "embreve" && (
            <div id="panel-embreve" role="tabpanel" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {n.itensEmBreve.map((item, i) => {
                const Icon = ICONES[item.icone] || Sparkles;
                return (
                  <div key={i} className="rounded-xl border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </div>
                      <PillDeStatus tom={item.tom as "erro" | "sucesso" | "info" | "atencao" | "neutro"}>
                        {item.status}
                      </PillDeStatus>
                    </div>
                    <h4 className="font-semibold">{item.titulo}</h4>
                    <p className="text-sm text-muted-foreground flex-1">{item.descricao}</p>
                    {item.previsao && (
                      <span className="text-xs font-medium text-muted-foreground mt-2 block">
                        {item.previsao}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
