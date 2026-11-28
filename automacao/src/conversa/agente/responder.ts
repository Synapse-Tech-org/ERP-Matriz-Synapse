import type { CanalTexto } from "../envio-texto.js";
import type { DistribuicaoCrm } from "../crm/distribuicao.js";
import type { ConfiguracaoModelo, DadosAtendimento, ModeloDeAtendimento } from "./modelo.js";
import type { Parametro } from "./prompts.js";
import type { CatalogoFaq } from "./faq.js";
import { instrucoesDoTurno } from "./politicas.js";
import { setTimeout as esperar } from "node:timers/promises";

interface DependenciasResposta {
  distribuicao: Pick<DistribuicaoCrm,"consultar">;
  prompts: {listarPrompts():Promise<Parametro[]>};
  modelo: Pick<ModeloDeAtendimento,"responderComBanco">;
  canal: CanalTexto;
  faq: CatalogoFaq;
}

export async function responderAoCliente(deps:DependenciasResposta,
  modelos:Pick<ConfiguracaoModelo,"modeloRouter"|"modeloInstitucional"|"modeloTriagem">,
  turno:{telefone:string;mensagem:string;historico:unknown[];primeiraMensagem:boolean;respostasSeguidas:number;
    contexto:Omit<DadosAtendimento,"faq"|"equipe"|"triagem">}) {
  const [distribuicao,faq] = await Promise.all([deps.distribuicao.consultar(),deps.faq.listarAtivas()]);
  const p = distribuicao.politicas;
  // A contagem deve vir do atendimento, nao de uma janela truncada de memoria.
  if (p.maxSequencia !== undefined) {
    if (!Number.isSafeInteger(turno.respostasSeguidas) || turno.respostasSeguidas<0) throw new Error("SEQUENCIA_INVALIDA");
    if (turno.respostasSeguidas>=p.maxSequencia) return {motivo:"LIMITE_RESPOSTAS_SEGUIDAS"} as const;
  }
  const historico = p.contexto === undefined ? turno.historico : turno.historico.slice(-p.contexto);
  const resposta = await deps.modelo.responderComBanco(deps.prompts,modelos,turno.mensagem,historico,{
    ...turno.contexto,faq,equipe:distribuicao.equipe,triagem:{porLista:distribuicao.porLista}
  },instrucoesDoTurno(p,turno.primeiraMensagem));
  if (p.atraso) await esperar(p.atraso*1000);
  const comprovante = await deps.canal.enviar(turno.telefone,resposta.texto);
  return {...resposta,comprovante};
}
