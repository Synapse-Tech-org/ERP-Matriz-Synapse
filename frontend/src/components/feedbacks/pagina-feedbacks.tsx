"use client";

import { useState } from "react";
import { Bug, History, Lightbulb, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import visual from "@/components/shell/agenda-recursos-v2.module.css";
import listaV2 from "@/components/shell/lista-v2.module.css";
import { Button } from "@/components/ui/button";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { Seletor } from "@/components/ui/seletor";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api/http-client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useTextos } from "@/lib/config/textos-provider";
import { useEnviarFeedback, useMeusFeedbacks } from "@/lib/feedbacks/use-feedbacks";
import { cn } from "@/lib/utils";
import type { AreaFeedback, TipoFeedback } from "@/lib/feedbacks/types";
import { areaDeFeedbackVisivel } from "@/lib/navegacao/visibilidade-do-menu";

const LIMITE_DESCRICAO = 2000;

const CHAVES_DE_AREA: Array<{
  valor: AreaFeedback;
  texto: keyof ReturnType<typeof useTextos>["feedbacks"]["areas"];
}> = [
  { valor: "GERAL", texto: "geral" },
  { valor: "ATENDIMENTOS", texto: "atendimentos" },
  { valor: "AGENDA", texto: "agenda" },
  { valor: "DASHBOARD", texto: "dashboard" },
  { valor: "EQUIPE", texto: "equipe" },
  { valor: "AUTOMACAO", texto: "automacao" },
  { valor: "MENSAGENS_PROGRAMADAS", texto: "mensagensProgramadas" },
  { valor: "LEMBRETES", texto: "lembretes" },
  { valor: "TAGS", texto: "tags" },
  { valor: "CONFIGURACOES", texto: "configuracoes" },
];

export function PaginaFeedbacks() {
  const catalogo = useTextos();
  const textos = catalogo.feedbacks;
  const enviar = useEnviarFeedback();
  const papel = useAuthStore((estado) => estado.papel);
  const { data: flags } = useQuery({
    queryKey: ["config", "features"],
    queryFn: () => apiFetch<string[]>("/api/v1/config/features"),
  });
  const layoutV2 = flags?.includes("gestao_layout_v2") ?? false;
  const [tipo, setTipo] = useState<TipoFeedback>("SUGESTAO");
  const [area, setArea] = useState<AreaFeedback | "">("GERAL");
  const [descricao, setDescricao] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [validacao, setValidacao] = useState(false);
  const areasVisiveis = CHAVES_DE_AREA.filter((opcao) =>
    areaDeFeedbackVisivel(opcao.valor, papel, flags),
  );

  function submeter(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviado(false);
    if (!area || !descricao.trim()) {
      setValidacao(true);
      return;
    }
    setValidacao(false);
    enviar.mutate(
      { tipo, areaChave: area, descricao },
      {
        onSuccess: () => {
          setArea("GERAL");
          setDescricao("");
          setTipo("SUGESTAO");
          setEnviado(true);
        },
      },
    );
  }

  return (
    <section className={layoutV2 ? cn(listaV2.pagina, listaV2.modulo, visual.paleta) : "mx-auto w-full max-w-3xl space-y-6 p-6"}>
      {layoutV2 && <CabecalhoListaV2 titulo={textos.titulo} busca={catalogo.gestao?.v2?.buscaGlobal} />}
      <header>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{textos.titulo}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{textos.descricao}</p>
        </div>
      </header>

      <div className={cn(layoutV2 && "grid min-h-0 flex-1 items-start gap-4 overflow-y-auto overscroll-contain xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]")}>
        <form className={cn("space-y-6 rounded-xl border bg-card p-6 shadow-sm", layoutV2 && "max-w-3xl rounded-2xl")} onSubmit={submeter}>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">{textos.tipo}</legend>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={tipo === "SUGESTAO" ? "default" : "outline"}
                aria-pressed={tipo === "SUGESTAO"}
                onClick={() => setTipo("SUGESTAO")}
              >
                <Lightbulb className="size-(--tamanho-icone-interface)" aria-hidden />
                {textos.tipos.sugestao}
              </Button>
              <Button
                type="button"
                variant={tipo === "ERRO" ? "default" : "outline"}
                aria-pressed={tipo === "ERRO"}
                onClick={() => setTipo("ERRO")}
              >
                <Bug className="size-(--tamanho-icone-interface)" aria-hidden />
                {textos.tipos.erro}
              </Button>
            </div>
          </fieldset>

          <label className="block space-y-2" htmlFor="feedback-area">
            <span className="text-sm font-semibold text-foreground">{textos.area}</span>
            <Seletor
              id="feedback-area"
              valor={area}
              placeholder={textos.areaPlaceholder}
              obrigatorio
              opcoes={areasVisiveis.map((opcao) => ({
                valor: opcao.valor,
                rotulo: textos.areas[opcao.texto],
              }))}
              onChange={(valor) => setArea(valor as AreaFeedback | "")}
            />
          </label>

          <label className="block space-y-2" htmlFor="feedback-descricao">
            <span className="text-sm font-semibold text-foreground">{textos.descricaoCampo}</span>
            <Textarea
              id="feedback-descricao"
              required
              maxLength={LIMITE_DESCRICAO}
              rows={8}
              value={descricao}
              placeholder={textos.descricaoPlaceholder}
              aria-describedby="feedback-limite feedback-mensagem"
              onChange={(evento) => setDescricao(evento.target.value)}
            />
            <span id="feedback-limite" className="block text-right text-xs text-muted-foreground">
              {textos.limite
                .replace("{atual}", String(descricao.length))
                .replace("{maximo}", String(LIMITE_DESCRICAO))}
            </span>
          </label>

          <div id="feedback-mensagem" aria-live="polite">
            {validacao && <p className="text-sm text-destructive">{textos.obrigatorio}</p>}
            {enviar.isError && <p className="text-sm text-destructive">{textos.erro}</p>}
            {enviado && <p className="text-sm text-cor-sucesso">{textos.sucesso}</p>}
          </div>

          <Button type="submit" className={cn(layoutV2 && "rounded-xl")} disabled={enviar.isPending}>
            <Send className="size-(--tamanho-icone-interface)" aria-hidden />
            {enviar.isPending ? textos.enviando : textos.enviar}
          </Button>
        </form>
        {layoutV2 && <MeusEnvios />}
      </div>
    </section>
  );
}

function MeusEnvios() {
  const textos = useTextos().feedbacks;
  const usuarioId = useAuthStore((estado) => estado.usuarioId);
  const consulta = useMeusFeedbacks(usuarioId);
  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? [];

  return (
    <section className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
        <History className="size-4 text-primary" aria-hidden />{textos.meusEnvios}
      </h2>
      {consulta.isPending && <p role="status" className="text-sm text-muted-foreground">{textos.historicoCarregando}</p>}
      {consulta.isError && <ErroDeCarregamento mensagem={textos.historicoErro} onTentarNovamente={() => void consulta.refetch()} />}
      {consulta.isSuccess && itens.length === 0 && (
        <p className="rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground">{textos.historicoVazio}</p>
      )}
      <ul className="space-y-2">
        {itens.map((item) => {
          const area = CHAVES_DE_AREA.find(({ valor }) => valor === item.areaChave);
          return (
            <li key={item.id} className="space-y-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className={cn("rounded-full px-2 py-1 font-medium", item.tipo === "ERRO"
                  ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                  {item.tipo === "ERRO" ? textos.tipos.erro : textos.tipos.sugestao}
                </span>
                {area && <span>{textos.areas[area.texto]}</span>}
                <time dateTime={item.criadoEm}>
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.criadoEm))}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{item.descricao}</p>
              {textos.acompanhamento && (
                <div className="space-y-2 border-t pt-2 text-sm">
                  <span className={item.resposta ? "font-medium text-cor-sucesso" : "font-medium text-cor-atencao"}>
                    {item.resposta ? textos.acompanhamento.resolvido : textos.acompanhamento.emAnalise}
                  </span>
                  {item.resposta && (
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="font-medium">{textos.acompanhamento.resposta}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{item.resposta}</p>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {consulta.hasNextPage && (
        <Button type="button" variant="outline" size="sm" className="mt-4" disabled={consulta.isFetching}
          onClick={() => void consulta.fetchNextPage()}>
          {textos.historicoMais}
        </Button>
      )}
    </section>
  );
}
