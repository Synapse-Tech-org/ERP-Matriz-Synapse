export type ConteudoRecebido =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'midia'; formato: 'imagem' | 'audio' | 'video' | 'documento' }
  | { tipo: 'clique'; origem: 'botao' | 'lista'; opcaoId: string; rotulo: string };

export interface MensagemRecebida {
  provedor: string;
  instancia: string;
  mensagemId: string;
  telefone: string;
  mensagemRespondidaId: string | null;
  conteudo: ConteudoRecebido;
}

export interface AdaptadorEntrada {
  // A Meta pode trazer varias mensagens no mesmo evento.
  normalizar(payload: unknown): MensagemRecebida[];
}
