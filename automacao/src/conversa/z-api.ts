import type { AdaptadorEntrada, ConteudoRecebido, MensagemRecebida } from './entrada.js';
import { objeto, telefone, texto } from './json.js';

function lerConteudo(m: Record<string, unknown>): ConteudoRecebido | null {
  const interacoes = ['buttonsResponseMessage', 'listResponseMessage', 'pollVote'].filter(k => k in m);
  if (interacoes.length) {
    // Nao reinterpretar voto ou clique malformado como texto comum para a IA.
    const [campo] = interacoes;
    if (!campo || campo === 'pollVote' || interacoes.length !== 1) return null;
    const item = objeto(m[campo]);
    const lista = campo === 'listResponseMessage';
    const opcaoId = texto(lista ? item.selectedRowId : item.buttonId);
    const rotulo = texto(item.message) ?? (lista ? texto(item.title) : null);
    return opcaoId && rotulo ? { tipo: 'clique', origem: lista ? 'lista' : 'botao', opcaoId, rotulo } : null;
  }
  const body = texto(objeto(m.text).message);
  if (body) return { tipo: 'texto', texto: body };
  const formatos = { image: 'imagem', audio: 'audio', document: 'documento', video: 'video' } as const;
  for (const [campo, formato] of Object.entries(formatos)) {
    const item = objeto(m[campo]);
    if (texto(item[campo + 'Url'])?.startsWith('https://') && !item.downloadError) return { tipo: 'midia', formato };
  }
  return null;
}

export class EntradaZApi implements AdaptadorEntrada {
  constructor(private readonly instancia: string) {}

  normalizar(payload: unknown): MensagemRecebida[] {
    const m = objeto(payload);
    if (!this.instancia || m.instanceId !== this.instancia || m.type !== 'ReceivedCallback' || m.fromMe !== false) return [];
    if (['isGroup', 'isNewsletter', 'isStatusReply', 'waitingMessage', 'isEdit'].some(k => k in m && m[k] !== false)) return [];
    const id = texto(m.messageId);
    if (!id || !telefone(m.phone) || !Number.isSafeInteger(m.momment) || Number(m.momment) <= 0) return [];
    const conteudo = lerConteudo(m);
    return conteudo ? [{ provedor: 'z-api', instancia: this.instancia, telefone: m.phone, mensagemId: id,
      mensagemRespondidaId: texto(m.referenceMessageId), conteudo }] : [];
  }
}
