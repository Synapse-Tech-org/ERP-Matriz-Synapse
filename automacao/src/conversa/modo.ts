export type ModoConversa = 'AGENTE_IA' | 'CHATBOT_DETERMINISTICO';

export function lerModoConversa(valor: string | undefined): ModoConversa | null {
  if (!valor) return null;
  if (valor === 'AGENTE_IA' || valor === 'CHATBOT_DETERMINISTICO') return valor;
  throw new Error('AUTOMACAO_CONVERSA_MODO deve ser AGENTE_IA, CHATBOT_DETERMINISTICO ou vazio');
}

// Quem recebe o evento fornece os dois tratadores; o transporte WhatsApp nao escolhe o fluxo.
export function selecionarTratador<T>(
  configuracao: { automacaoHabilitada: boolean; modoConversa: ModoConversa | null },
  tratadores: Readonly<Record<ModoConversa, T>>,
): T | null {
  return configuracao.automacaoHabilitada && configuracao.modoConversa
    ? tratadores[configuracao.modoConversa]
    : null;
}
