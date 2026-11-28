import type { MensagemRecebida } from '../entrada.js';

export interface AvaliacaoPendente {
  telefone: string; atendimentoId: string; atendenteId: string; mensagemOriginalId: string;
  opcoes: readonly { id: string; nota: number; comentario: string }[];
}

export function decidirAvaliacao(m: MensagemRecebida, pendente: AvaliacaoPendente | null) {
  if (!pendente || pendente.telefone !== m.telefone) return { tipo: 'nao_aplicavel' } as const;
  if (m.mensagemRespondidaId && m.mensagemRespondidaId !== pendente.mensagemOriginalId)
    return { tipo: 'nao_aplicavel' } as const;
  // Resposta livre encerra a espera mas nao inventa uma nota pelo texto.
  const c = m.conteudo;
  if (c.tipo !== 'clique') return { tipo: 'encerrar_sem_nota' } as const;
  const opcoes = pendente.opcoes.filter(o => o.id === c.opcaoId);
  if (opcoes.length !== 1 || !opcoes[0] || !Number.isFinite(opcoes[0].nota))
    return { tipo: 'clique_nao_reconhecido' } as const;
  return { tipo: 'registrar_nota', atendimentoId: pendente.atendimentoId, atendenteId: pendente.atendenteId,
    nota: opcoes[0].nota, comentario: opcoes[0].comentario } as const;
}
