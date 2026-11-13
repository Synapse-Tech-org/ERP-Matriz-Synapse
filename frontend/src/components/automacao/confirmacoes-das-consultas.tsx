"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { useAtualizarParametroAutomacao, useConfiguracaoAutomacao } from "@/lib/automacao/use-automacao";
import { useTextos } from "@/lib/config/textos-provider";
import { useCapacidades } from "@/lib/gestao/use-capacidades";

const chave = "clinica.regua_consultas";
const mensagens = ["confirmacao", "lembrete", "reengajamento"] as const;
const horario = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const esquema = z.object({
  inicio: horario, fim: horario, antecedencia: z.number().int().min(0).max(168),
  confirmacao: z.string().max(2000), lembrete: z.string().max(2000),
  reengajamento: z.string().max(2000),
}).refine(({ inicio, fim }) => inicio < fim);
type Regua = z.infer<typeof esquema>;

function ler(valor: string | undefined) {
  try {
    const resultado = esquema.safeParse(JSON.parse(valor ?? "null"));
    return resultado.success ? resultado.data : null;
  } catch {
    return null;
  }
}

export function ConfirmacoesDasConsultas() {
  const t = useTextos().automacao;
  const consulta = useConfiguracaoAutomacao();
  if (!t.confirmacoesConsultas) return null;
  if (consulta.isPending) return <p role="status">{t.carregando}</p>;
  if (consulta.isError) {
    return <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => void consulta.refetch()} />;
  }
  const parametro = consulta.data?.find((item) => item.chave === chave);
  const inicial = ler(parametro?.valor);
  return inicial ? <Editor inicial={inicial} /> : <p role="alert">{t.confirmacoesConsultas.erroDados}</p>;
}

function Editor({ inicial }: { inicial: Regua }) {
  const automacao = useTextos().automacao;
  const t = automacao.confirmacoesConsultas!;
  const editar = useCapacidades().pode("automacao.editar_parametros");
  const salvar = useAtualizarParametroAutomacao();
  const [rascunho, definir] = useState(inicial);
  const resultado = esquema.safeParse(rascunho);
  const alterado = JSON.stringify(rascunho) !== JSON.stringify(inicial);

  return (
    <form className="space-y-4" onSubmit={(evento) => {
      evento.preventDefault();
      if (!editar || !alterado || !resultado.success || salvar.isPending) return;
      salvar.mutate({ chave, valor: JSON.stringify(resultado.data) });
    }}>
      <fieldset disabled={!editar || salvar.isPending} className="space-y-3 rounded-2xl border bg-card p-5">
        <legend className="px-2 text-sm font-semibold">{t.janela}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["inicio", "fim"] as const).map((campo) => (
            <label key={campo} className="grid gap-2 text-sm font-medium">
              {t[campo]}
              <Input type="time" required value={rascunho[campo]} onChange={(evento) => {
                definir({ ...rascunho, [campo]: evento.target.value });
              }} />
            </label>
          ))}
          <label className="grid gap-2 text-sm font-medium">
            {t.antecedencia}
            <Input type="number" min={0} max={168} required
              value={Number.isNaN(rascunho.antecedencia) ? "" : rascunho.antecedencia}
              onChange={(evento) => definir({ ...rascunho, antecedencia: evento.target.valueAsNumber })} />
          </label>
        </div>
        {rascunho.inicio && rascunho.fim && rascunho.inicio >= rascunho.fim && (
          <p role="alert" className="text-sm text-destructive">{t.erroJanela}</p>
        )}
      </fieldset>
      <fieldset disabled={!editar || salvar.isPending} className="grid gap-4 rounded-2xl border bg-card p-5">
        <legend className="px-2 text-sm font-semibold">{t.mensagens}</legend>
        {mensagens.map((campo) => (
          <label key={campo} className="grid gap-2 text-sm font-medium">
            {t[campo]}
            <Textarea maxLength={2000} value={rascunho[campo]} onChange={(evento) => {
              definir({ ...rascunho, [campo]: evento.target.value });
            }} />
          </label>
        ))}
      </fieldset>
      {salvar.isError && <p role="alert" className="text-sm text-destructive">{automacao.erro}</p>}
      {salvar.isSuccess && !alterado && <p role="status" className="text-sm text-cor-sucesso">{t.salvo}</p>}
      {editar && <Button type="submit" disabled={!alterado || !resultado.success || salvar.isPending}>{automacao.salvar}</Button>}
    </form>
  );
}
