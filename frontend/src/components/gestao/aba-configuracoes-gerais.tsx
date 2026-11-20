"use client";

import { useState } from "react";
import { Clock, MessagesSquare, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAtualizarParametroAutomacao, useConfiguracaoAutomacao } from "@/lib/automacao/use-automacao";
import type { ParametroAutomacao } from "@/lib/automacao/types";
import {
  CHAVES_CONFIGURACOES_GERAIS as CHAVES, DIAS_DA_SEMANA, chaveDoDia, escreverDia, horarioValido, lerDia,
  type DiaDaSemana, type ExpedienteDoDia, type ModoDoDia,
} from "@/lib/gestao/configuracoes-gerais";

import { CampoComSalvar, LinhaConfiguracao, LinhaInterruptor, SecaoConfiguracoes } from "./campos-configuracoes-gerais";
import type { TextosGestao } from "./apoio";

type Textos = TextosGestao["configuracoesGerais"];

/**
 * Gestão › Configurações gerais. Cada linha edita uma chave de `configuracao_automacao` pelo CRUD já
 * existente; a chave que não existe na instância simplesmente não aparece (nada de controle fantasma).
 */
export function AbaConfiguracoesGerais({ textos, editavel }: { textos: TextosGestao; editavel: boolean }) {
  const t = textos.configuracoesGerais;
  const parametros = useConfiguracaoAutomacao();
  if (parametros.isLoading) return <p className="text-sm text-muted-foreground">{textos.carregando}</p>;
  if (parametros.isError || !parametros.data) {
    return <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => void parametros.refetch()} />;
  }
  const porChave = new Map(parametros.data.map((p) => [p.chave, p]));
  const p = (chave: string) => porChave.get(chave);
  const k = (parametro: ParametroAutomacao) => `${parametro.chave}:${parametro.valor}`;
  const fim = p(CHAVES.fimHabilitado);
  const usarExpediente = p(CHAVES.fimUsarExpediente);
  const horarioFixo = p(CHAVES.fimHorario);
  const inativos = p(CHAVES.inativosHabilitado);
  const horas = p(CHAVES.inativosHoras);
  const semResposta = p(CHAVES.semResposta);
  const presenca = p(CHAVES.presenca);
  const audio = p(CHAVES.audio);
  const avaliacao = p(CHAVES.avaliacao);
  const nps = p(CHAVES.nps);
  const npsPergunta = p(CHAVES.npsPergunta);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2" data-slot="configuracoes-gerais">
      {!editavel && (
        <p role="status" className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground xl:col-span-2">{t.somenteLeitura}</p>
      )}

      <SecaoConfiguracoes icone={MessagesSquare} titulo={t.secoes.atendimentos}>
        {fim && (
          <LinhaInterruptor parametro={fim} titulo={t.fimExpediente.titulo} descricao={t.fimExpediente.descricao} editavel={editavel} textos={t}>
            {fim.valor === "true" && usarExpediente && horarioFixo && (
              <QuandoFinalizar usarExpediente={usarExpediente} horarioFixo={horarioFixo} editavel={editavel} textos={t} />
            )}
          </LinhaInterruptor>
        )}
        {inativos && (
          <LinhaInterruptor parametro={inativos} titulo={t.inativos.titulo} descricao={t.inativos.descricao} editavel={editavel} textos={t}>
            {inativos.valor === "true" && horas && (
              <CampoComSalvar key={k(horas)} parametro={horas} rotulo={t.inativos.limite} tipo="number" unidade={t.unidades.horas} editavel={editavel} textos={t} />
            )}
          </LinhaInterruptor>
        )}
        {semResposta && (
          <LinhaConfiguracao titulo={t.semResposta.titulo} descricao={t.semResposta.descricao} controle={(
            <CampoComSalvar key={k(semResposta)} parametro={semResposta} rotulo={t.semResposta.titulo} rotuloOculto tipo="number" unidade={t.unidades.minutos} editavel={editavel} textos={t} />
          )} />
        )}
        {presenca && <LinhaInterruptor parametro={presenca} titulo={t.presenca.titulo} descricao={t.presenca.descricao} editavel={editavel} textos={t} />}
        {audio && (
          <LinhaConfiguracao titulo={t.audio.titulo} descricao={t.audio.descricao} controle={(
            <CampoComSalvar key={k(audio)} parametro={audio} rotulo={t.audio.titulo} rotuloOculto tipo="number" unidade={t.unidades.segundos} editavel={editavel} textos={t} />
          )} />
        )}
      </SecaoConfiguracoes>

      <div className="grid min-w-0 gap-5">
        <Expediente porChave={porChave} editavel={editavel} textos={t} />

        {avaliacao && (
          <SecaoConfiguracoes icone={Star} titulo={t.secoes.avaliacao}>
            <LinhaInterruptor parametro={avaliacao} titulo={t.avaliacao.titulo} descricao={t.avaliacao.descricao} editavel={editavel} textos={t} />
            {nps && (
              <LinhaInterruptor parametro={nps} titulo={t.avaliacao.nps} descricao={t.avaliacao.npsDescricao} editavel={editavel} textos={t}>
                {nps.valor === "true" && npsPergunta && (
                  <CampoComSalvar key={k(npsPergunta)} parametro={npsPergunta} rotulo={t.avaliacao.npsPergunta} editavel={editavel} textos={t} />
                )}
              </LinhaInterruptor>
            )}
          </SecaoConfiguracoes>
        )}
      </div>
    </div>
  );
}

function QuandoFinalizar({ usarExpediente, horarioFixo, editavel, textos }: {
  usarExpediente: ParametroAutomacao; horarioFixo: ParametroAutomacao; editavel: boolean; textos: Textos;
}) {
  const atualizar = useAtualizarParametroAutomacao();
  const segueExpediente = usarExpediente.valor !== "false";
  const opcoes = [
    { valor: "true", rotulo: textos.fimExpediente.usarExpediente },
    { valor: "false", rotulo: textos.fimExpediente.horarioFixo },
  ];
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{textos.fimExpediente.quando}</p>
        <Select value={segueExpediente ? "true" : "false"} disabled={!editavel || atualizar.isPending}
          onValueChange={(valor) => { if (valor) atualizar.mutate({ chave: usarExpediente.chave, valor }); }}>
          <SelectTrigger className="mt-1.5 min-w-60" aria-label={textos.fimExpediente.quando}>
            <SelectValue>{segueExpediente ? opcoes[0].rotulo : opcoes[1].rotulo}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            {opcoes.map((opcao) => <SelectItem key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {!segueExpediente && (
        <CampoComSalvar key={`${horarioFixo.chave}:${horarioFixo.valor}`} parametro={horarioFixo} rotulo={textos.fimExpediente.horario} tipo="time" editavel={editavel} textos={textos} />
      )}
      {atualizar.isError && <p role="alert" className="w-full text-xs text-destructive">{textos.erroSalvar}</p>}
    </div>
  );
}

function Expediente({ porChave, editavel, textos }: { porChave: Map<string, ParametroAutomacao>; editavel: boolean; textos: Textos }) {
  const inicio = porChave.get(CHAVES.expedienteInicio);
  const fim = porChave.get(CHAVES.expedienteFim);
  if (!inicio || !fim) return null;
  const dias = DIAS_DA_SEMANA.flatMap((dia) => {
    const parametro = porChave.get(chaveDoDia(dia));
    return parametro ? [{ dia, parametro }] : [];
  });
  return (
    <SecaoConfiguracoes icone={Clock} titulo={textos.secoes.expediente} descricao={textos.expediente.descricao}>
      <LinhaConfiguracao titulo={textos.expediente.padrao} controle={(
        <div className="flex flex-wrap gap-3">
          <CampoComSalvar key={`${inicio.chave}:${inicio.valor}`} parametro={inicio} rotulo={textos.expediente.inicio} tipo="time" editavel={editavel} textos={textos}
            validar={(valor) => (horarioValido(valor, fim.valor) ? null : textos.expediente.erroFaixa)} />
          <CampoComSalvar key={`${fim.chave}:${fim.valor}`} parametro={fim} rotulo={textos.expediente.fim} tipo="time" editavel={editavel} textos={textos}
            validar={(valor) => (horarioValido(inicio.valor, valor) ? null : textos.expediente.erroFaixa)} />
        </div>
      )} />
      {dias.length > 0 && (
        <div className="py-4">
          <p className="text-sm font-semibold">{textos.expediente.porDia}</p>
          <div className="mt-3 divide-y rounded-xl border">
            {dias.map(({ dia, parametro }) => (
              <LinhaDoDia key={`${parametro.chave}:${parametro.valor}`} dia={dia} parametro={parametro} padrao={{ inicio: inicio.valor, fim: fim.valor }}
                editavel={editavel} textos={textos} />
            ))}
          </div>
        </div>
      )}
    </SecaoConfiguracoes>
  );
}

function LinhaDoDia({ dia, parametro, padrao, editavel, textos }: {
  dia: DiaDaSemana; parametro: ParametroAutomacao; padrao: { inicio: string; fim: string }; editavel: boolean; textos: Textos;
}) {
  const atualizar = useAtualizarParametroAutomacao();
  const salvo = lerDia(parametro.valor);
  const [rascunho, setRascunho] = useState<ExpedienteDoDia>(salvo);
  const rotulos: Record<ModoDoDia, string> = {
    padrao: textos.expediente.igualAoPadrao, fechado: textos.expediente.fechado, proprio: textos.expediente.proprio,
  };
  const valido = rascunho.modo !== "proprio" || horarioValido(rascunho.inicio, rascunho.fim);
  const alterado = escreverDia(rascunho) !== escreverDia(salvo);
  const nomeDoDia = textos.expediente.dias[dia];
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-1.5" data-slot="expediente-dia">
      <span className="w-20 text-sm font-medium">{nomeDoDia}</span>
      <Select value={rascunho.modo} disabled={!editavel}
        onValueChange={(modo) => {
          if (!modo) return;
          // Horário próprio parte do expediente padrão, para não abrir com os campos vazios e já em erro.
          setRascunho((atual) => (modo === "proprio" && !atual.inicio
            ? { modo: "proprio", inicio: padrao.inicio, fim: padrao.fim }
            : { ...atual, modo: modo as ModoDoDia }));
        }}>
        <SelectTrigger className="h-9 min-w-44" aria-label={nomeDoDia}><SelectValue>{rotulos[rascunho.modo]}</SelectValue></SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start">
          {(Object.keys(rotulos) as ModoDoDia[]).map((modo) => <SelectItem key={modo} value={modo}>{rotulos[modo]}</SelectItem>)}
        </SelectContent>
      </Select>
      {rascunho.modo === "padrao" && (
        <span className="text-sm text-muted-foreground tabular-nums">{padrao.inicio} – {padrao.fim}</span>
      )}
      {rascunho.modo === "proprio" && (
        <>
          <Input type="time" className="w-32" aria-label={`${nomeDoDia} · ${textos.expediente.inicio}`} value={rascunho.inicio} disabled={!editavel}
            onChange={(evento) => setRascunho((atual) => ({ ...atual, inicio: evento.target.value }))} />
          <Input type="time" className="w-32" aria-label={`${nomeDoDia} · ${textos.expediente.fim}`} value={rascunho.fim} disabled={!editavel}
            onChange={(evento) => setRascunho((atual) => ({ ...atual, fim: evento.target.value }))} />
        </>
      )}
      {editavel && alterado && (
        <Button size="sm" disabled={!valido || atualizar.isPending} onClick={() => atualizar.mutate({ chave: parametro.chave, valor: escreverDia(rascunho) })}>
          {atualizar.isPending ? textos.salvando : textos.salvar}
        </Button>
      )}
      {!valido && <p role="alert" className="w-full text-xs text-destructive">{textos.expediente.erroFaixa}</p>}
      {atualizar.isError && <p role="alert" className="w-full text-xs text-destructive">{textos.erroSalvar}</p>}
    </div>
  );
}
