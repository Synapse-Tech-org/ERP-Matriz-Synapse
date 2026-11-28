import type { TransporteJson } from '../../followup/http.js';
import { objeto, texto } from '../json.js';
import { lerPrompts, preencherContexto, type Parametro } from './prompts.js';
import { instrucoesPerfil } from './perfil.js';

export interface DadosAtendimento {
  faq:unknown; equipe:unknown; triagem?:unknown; instrucao_operacional_transferencia?:string;
  data_hora_atual?:string; faq_horario?:unknown; atendente_escolhido?:unknown;
}

type Fala = { role:'user'|'assistant'; content:string };
export interface ConfiguracaoModelo {
  modeloRouter:string; modeloInstitucional:string; modeloTriagem:string;
  global:string; router:string; institucional:string; triagem:string;
  contexto:string; contextoInstitucional:string;
}
export class ModeloDeAtendimento {
  constructor(private readonly http: TransporteJson, private readonly urlBase: string, private readonly token: string) {}

  async responderComBanco(repositorio: { listarPrompts(): Promise<Parametro[]> },
    modelos: Pick<ConfiguracaoModelo, 'modeloRouter'|'modeloInstitucional'|'modeloTriagem'>,
    mensagem:string, historico:unknown[], contexto:DadosAtendimento, instrucaoTurno = '') {
    // Uma leitura por mensagem: as duas chamadas usam a mesma configuracao.
    const parametros = await repositorio.listarPrompts();
    const prompts = lerPrompts(parametros);
    prompts.global = [prompts.global, instrucoesPerfil(parametros),instrucaoTurno].filter(Boolean).join('\n');
    return this.responder({...modelos,...prompts}, mensagem, historico, contexto);
  }

  private async completar(model:string, sistema:string, falas: Fala[]) {
    if (!model.trim() || !sistema.trim()) throw new Error('AGENTE_CONFIGURACAO_INCOMPLETA');
    const r = objeto(await this.http.chamar(this.urlBase.replace(/\/$/,'') + '/chat/completions',
      {Authorization:'Bearer '+this.token},{model,messages:[{role:'system',content:sistema},...falas]}));
    const primeira = objeto(Array.isArray(r.choices)?r.choices[0]:null);
    const resposta = texto(objeto(primeira.message).content);
    if (!resposta || primeira.finish_reason !== 'stop') throw new Error('AGENTE_RESPOSTA_INCOMPLETA');
    return resposta;
  }

  async responder(config: ConfiguracaoModelo, mensagem:string, historico:unknown[], contexto: DadosAtendimento) {
    const entrada: Fala = {role:'user',content:mensagem};
    const intencao = (await this.completar(config.modeloRouter, config.router,[entrada])).trim().toUpperCase();
    if (!['DUVIDA_INSTITUCIONAL','TRIAGEM_OU_TRANSFERENCIA'].includes(intencao)) throw new Error('INTENCAO_NAO_RECONHECIDA');
    const falas: Fala[] = [];
    for (const bruto of historico) {
      const m = objeto(bruto);
      const conteudo = texto(m.content ?? objeto(m.data).content);
      if (conteudo && (m.type==='human' || m.type==='ai')) falas.push({role:m.type==='ai'?'assistant':'user',content:conteudo});
    }
    const institucional = intencao==='DUVIDA_INSTITUCIONAL';
    const regras = institucional?config.institucional:config.triagem;
    if (!regras.trim() || !config.global.trim()) throw new Error('PROMPTS_ATENDIMENTO_AUSENTES');
    // Dados do CRM nao sao instrucoes de sistema nem autorizam executar ferramentas.
    const dados:Fala = {role:'user',content:institucional
      ? preencherContexto(config.contextoInstitucional,{faq:contexto.faq})
      : preencherContexto(config.contexto,{...contexto})};
    return {intencao,texto:await this.completar(institucional?config.modeloInstitucional:config.modeloTriagem,
      config.global+'\n'+regras,[dados,...falas,entrada])};
  }
}
