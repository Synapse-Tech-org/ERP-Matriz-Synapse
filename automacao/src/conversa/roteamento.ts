import { selecionarTratador, type ModoConversa } from './modo.js';
import type { MensagemRecebida } from './entrada.js';

type Tratar = (mensagem: MensagemRecebida) => Promise<void>;
interface Destinos {
  // Resolve o ID da opcao no contexto da mensagem original e do atendimento.
  clique: (mensagem: MensagemRecebida) => Promise<'tratado' | 'sem_contexto'>;
  respostaPendente: (mensagem: MensagemRecebida) => Promise<boolean>;
  conversas: Partial<Record<ModoConversa, Tratar>>;
}

export async function encaminharMensagem(
  mensagem: MensagemRecebida,
  config: { automacaoHabilitada: boolean; modoConversa: ModoConversa | null },
  publico: { habilitada: boolean; numeros: readonly string[] },
  destinos: Destinos,
) {
  const conversar = selecionarTratador(config, {
    AGENTE_IA: destinos.conversas.AGENTE_IA, CHATBOT_DETERMINISTICO: destinos.conversas.CHATBOT_DETERMINISTICO,
  });
  if (!conversar) return 'SEM_TRATADOR_ATIVO';
  if (publico.habilitada && !publico.numeros.includes(mensagem.telefone)) return 'FORA_DO_PUBLICO';
  if (mensagem.conteudo.tipo === 'clique') {
    return await destinos.clique(mensagem) === 'tratado' ? 'CLIQUE_TRATADO' : 'CLIQUE_SEM_CONTEXTO';
  }
  if (await destinos.respostaPendente(mensagem)) return 'RESPOSTA_ESPECIAL_TRATADA';
  await conversar(mensagem);
  return 'CONVERSA';
}
