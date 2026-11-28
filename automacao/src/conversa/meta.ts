import type { AdaptadorEntrada, ConteudoRecebido, MensagemRecebida } from './entrada.js';
import { lista, objeto, telefone, texto } from './json.js';

function lerConteudo(m: Record<string, unknown>): ConteudoRecebido | null {
  if (m.type === 'text') {
    const body = texto(objeto(m.text).body);
    return body ? { tipo: 'texto', texto: body } : null;
  }
  if (m.type === 'button' || m.type === 'interactive') {
    const i = objeto(m.interactive);
    const origem = i.type === 'list_reply' ? 'lista' : 'botao';
    if (m.type !== 'button' && i.type !== 'list_reply' && i.type !== 'button_reply') return null;
    const item = m.type === 'button' ? objeto(m.button) : objeto(i[String(i.type)]);
    const opcaoId = texto(m.type === 'button' ? item.payload : item.id);
    const rotulo = texto(m.type === 'button' ? item.text : item.title);
    return opcaoId && rotulo ? { tipo: 'clique', origem, opcaoId, rotulo } : null;
  }
  const formatos = { image: 'imagem', audio: 'audio', document: 'documento', video: 'video' } as const;
  for (const [tipo, formato] of Object.entries(formatos))
    if (m.type === tipo && texto(objeto(m[tipo]).id)) return { tipo: 'midia', formato };
  return null;
}

export class EntradaMeta implements AdaptadorEntrada {
  constructor(private readonly numeroId: string) {}

  normalizar(payload: unknown): MensagemRecebida[] {
    const raiz = objeto(payload);
    if (!this.numeroId || raiz.object !== 'whatsapp_business_account') return [];
    const saida: MensagemRecebida[] = [];
    for (const entry of lista(raiz.entry)) {
      for (const change of lista(objeto(entry).changes)) {
        const { field, value } = objeto(change);
        const valor = objeto(value);
        // Um lote pode trazer status ou mensagens de outro numero da conta.
        if (field !== 'messages' || objeto(valor.metadata).phone_number_id !== this.numeroId) continue;
        for (const item of lista(valor.messages)) {
          const m = objeto(item);
          const id = texto(m.id);
          if (!id || !telefone(m.from) || m.group_id != null) continue;
          const conteudo = lerConteudo(m);
          if (conteudo) saida.push({ provedor: 'meta', instancia: this.numeroId, telefone: m.from,
            mensagemId: id, mensagemRespondidaId: texto(objeto(m.context).id), conteudo });
        }
      }
    }
    return saida;
  }
}
