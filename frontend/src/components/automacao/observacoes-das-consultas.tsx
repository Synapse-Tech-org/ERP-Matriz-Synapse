"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { useAtualizarParametroAutomacao, useConfiguracaoAutomacao } from "@/lib/automacao/use-automacao";
import { useTextos } from "@/lib/config/textos-provider";
import { useCapacidades } from "@/lib/gestao/use-capacidades";

const chave = "clinica.observacoes_consultas";
const esquema = z.array(z.object({ id: z.uuid(), tipo: z.string(), observacao: z.string() }));
type Linha = z.infer<typeof esquema>[number];

function ler(valor: string) {
  try {
    const resultado = esquema.safeParse(JSON.parse(valor));
    return resultado.success ? resultado.data : null;
  } catch {
    return null;
  }
}

export function ObservacoesDasConsultas() {
  const t = useTextos().automacao;
  const consulta = useConfiguracaoAutomacao();
  const parametro = consulta.data?.find((item) => item.chave === chave);
  if (!t.observacoesConsultas) return null;
  if (consulta.isPending) return <p role="status">{t.carregando}</p>;
  if (consulta.isError) {
    return <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => void consulta.refetch()} />;
  }
  const linhas = parametro ? ler(parametro.valor) : null;
  if (!linhas) return <p role="alert">{t.observacoesConsultas.erroDados}</p>;
  return <Editor key={parametro?.valor} inicial={linhas} />;
}

function Editor({ inicial }: { inicial: Linha[] }) {
  const automacao = useTextos().automacao;
  const t = automacao.observacoesConsultas!;
  const editar = useCapacidades().pode("automacao.editar_parametros");
  const salvar = useAtualizarParametroAutomacao();
  const [linhas, definir] = useState(inicial);
  const alterado = JSON.stringify(linhas) !== JSON.stringify(inicial);

  function atualizar(id: string, campos: Partial<Pick<Linha, "tipo" | "observacao">>) {
    definir((atuais) => atuais.map((linha) => linha.id === id ? { ...linha, ...campos } : linha));
  }

  return (
    <form className="space-y-4 rounded-2xl border bg-card p-5" onSubmit={(evento) => {
      evento.preventDefault();
      if (!editar || !alterado || salvar.isPending || linhas.some((linha) => !linha.tipo.trim())) return;
      salvar.mutate({ chave, valor: JSON.stringify(linhas.map((linha) => ({
        ...linha, tipo: linha.tipo.trim(), observacao: linha.observacao.trim(),
      }))) });
    }}>
      {linhas.length === 0 && <p className="rounded-xl bg-muted/30 p-5 text-sm text-muted-foreground">{t.vazio}</p>}
      {linhas.map((linha) => (
        <div key={linha.id} className="grid gap-3 border-b pb-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <label className="grid content-start gap-2 text-sm font-medium">
            {t.tipo}
            <Input required maxLength={120} value={linha.tipo} readOnly={!editar}
              disabled={salvar.isPending} onChange={(evento) => atualizar(linha.id, { tipo: evento.target.value })} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {t.observacao}
            <Textarea maxLength={2000} value={linha.observacao} readOnly={!editar}
              disabled={salvar.isPending} onChange={(evento) => atualizar(linha.id, { observacao: evento.target.value })} />
          </label>
          {editar && (
            <Button type="button" variant="ghost" size="icon" aria-label={t.remover} disabled={salvar.isPending}
              onClick={() => definir((atuais) => atuais.filter(({ id }) => id !== linha.id))}>
              <Trash2 aria-hidden />
            </Button>
          )}
        </div>
      ))}
      {salvar.isError && <p role="alert" className="text-sm text-destructive">{automacao.erro}</p>}
      {editar && (
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" disabled={salvar.isPending || linhas.length >= 50}
            onClick={() => definir((atuais) => [...atuais, { id: crypto.randomUUID(), tipo: "", observacao: "" }])}>
            <Plus aria-hidden />{t.adicionar}
          </Button>
          <Button type="submit" disabled={!alterado || salvar.isPending}>{automacao.salvar}</Button>
        </div>
      )}
    </form>
  );
}
