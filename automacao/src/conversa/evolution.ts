import type { AdaptadorEntrada, ConteudoRecebido, MensagemRecebida } from './entrada.js';

import { objeto, texto } from './json.js';

function conteudoDaMensagem(m: Record<string, unknown>):
  { conteudo: ConteudoRecebido; referencia: string | null } | null {
  for (const campo of ['buttonsResponseMessage', 'templateButtonReplyMessage', 'listResponseMessage']) {
    if (!(campo in m)) continue;
    const item = objeto(m[campo]);
    const lista = campo === 'listResponseMessage';
    const opcaoId = texto(lista ? objeto(item.singleSelectReply).selectedRowId :
      campo === 'buttonsResponseMessage' ? item.selectedButtonId : item.selectedId);
    const rotulo = texto(lista ? item.title : item.selectedDisplayText);
    if (!opcaoId || !rotulo) return null;
    return { conteudo: { tipo: 'clique', origem: lista ? 'lista' : 'botao', opcaoId, rotulo },
      referencia: texto(objeto(item.contextInfo).stanzaId) };
  }
  // Native Flow nao garante um ID de opcao. Nunca deduzir uma acao pelo rotulo.
  if ('interactiveResponseMessage' in m) return null;
  const formatos = { imageMessage: 'imagem', audioMessage: 'audio', videoMessage: 'video', documentMessage: 'documento' } as const;
  for (const [campo, formato] of Object.entries(formatos)) {
    if (!m[campo] || typeof m[campo] !== 'object') continue;
    return { conteudo: { tipo: 'midia', formato }, referencia: texto(objeto(objeto(m[campo]).contextInfo).stanzaId) };
  }
  const estendido = objeto(m.extendedTextMessage);
  const mensagem = texto(m.conversation) ?? texto(estendido.text);
  return mensagem ? { conteudo: { tipo: 'texto', texto: mensagem }, referencia: texto(objeto(estendido.contextInfo).stanzaId) } : null;
}

export class EntradaEvolution implements AdaptadorEntrada {
  constructor(private readonly instancia: string) {}

  normalizar(payload: unknown): MensagemRecebida[] {
    const raiz = objeto(payload);
    if (!this.instancia || raiz.instance !== this.instancia || raiz.event !== 'messages.upsert') return [];
    const dados = objeto(raiz.data);
    const chave = objeto(dados.key);
    if (chave.fromMe !== false || !Number.isSafeInteger(dados.messageTimestamp) || Number(dados.messageTimestamp) <= 0) return [];
    const jid = texto(chave.remoteJid);
    // Um LID nao e um telefone; so usamos o numero alternativo fornecido pelo canal.
    const destino = jid?.endsWith('@lid') ? texto(chave.remoteJidAlt) : jid;
    const telefone = destino?.match(/^([1-9]\d{7,14})@s\.whatsapp\.net$/)?.[1];
    const mensagemId = texto(chave.id);
    if (!telefone || !mensagemId) return [];
    let mensagem = objeto(dados.message);
    for (let i = 0; i < 3; i++) {
      const campo = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage'].find(k => k in mensagem);
      if (!campo) break;
      mensagem = objeto(objeto(mensagem[campo]).message);
    }
    const item = conteudoDaMensagem(mensagem);
    return item ? [{ provedor: 'evolution', instancia: this.instancia, telefone, mensagemId,
      conteudo: item.conteudo, mensagemRespondidaId: item.referencia }] : [];
  }
}
