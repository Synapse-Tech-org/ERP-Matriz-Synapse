import assert from 'node:assert/strict';
import test from 'node:test';
import { EntradaEvolution } from '../src/conversa/evolution.js';
import { encaminharMensagem } from '../src/conversa/roteamento.js';

const adaptador = new EntradaEvolution('teste');
const numero = '5511999990000';
function evento(message: unknown) {
  return { event: 'messages.upsert', instance: 'teste', data: { key: {
    fromMe: false, remoteJid: numero + '@s.whatsapp.net', id: 'recebida' }, messageTimestamp: 1, message } };
}

test('Evolution separa texto, midia e interacao sem transportar URL ou chave de midia', () => {
  assert.deepEqual(adaptador.normalizar(evento({ conversation: 'Nao' }))[0]?.conteudo, { tipo: 'texto', texto: 'Nao' });
  assert.deepEqual(adaptador.normalizar(evento({ viewOnceMessage: { message: { imageMessage: { url: 'privada' } } } }))[0]?.conteudo,
    { tipo: 'midia', formato: 'imagem' });
  const resposta = adaptador.normalizar(evento({ listResponseMessage: { title: 'Equipe', singleSelectReply: { selectedRowId: 'fila-2' },
    contextInfo: { stanzaId: 'menu' } } }))[0];
  assert.equal(resposta?.mensagemRespondidaId, 'menu');
  assert.deepEqual(resposta?.conteudo, { tipo: 'clique', origem: 'lista', opcaoId: 'fila-2', rotulo: 'Equipe' });
});

test('ignora status, grupos, eco, instancia diferente e cliques malformados', () => {
  const e = evento({ conversation: 'oi' });
  for (const payload of [null, { ...e, event: 'messages.update' }, { ...e, instance: 'outra' },
    ...[{ fromMe: true }, { remoteJid: '123@g.us' }, { remoteJid: '123@lid' }].map(k =>
      ({ ...e, data: { ...e.data, key: { ...e.data.key, ...k } } })),
    evento({ conversation: 'Nao', buttonsResponseMessage: {} })]) assert.deepEqual(adaptador.normalizar(payload), []);
});

test('um evento tem um destino: clique desconhecido nunca cai na IA, texto pendente tambem nao', async () => {
  const chamadas: string[] = [];
  const destinos = { clique: async () => { chamadas.push('clique'); return 'sem_contexto' as const; },
    respostaPendente: async () => { chamadas.push('pendente'); return true; },
    conversas: { AGENTE_IA: async () => { chamadas.push('ia'); } } };
  const config = { automacaoHabilitada: true, modoConversa: 'AGENTE_IA' as const };
  const publico = { habilitada: true, numeros: [numero] };
  const [clique] = adaptador.normalizar(evento({ buttonsResponseMessage: { selectedButtonId: 'negativo', selectedDisplayText: 'Nao' } }));
  const [texto] = adaptador.normalizar(evento({ conversation: 'Nao' }));
  assert.ok(clique && texto);
  assert.equal(await encaminharMensagem(clique, config, { ...publico, numeros: [] }, destinos), 'FORA_DO_PUBLICO');
  assert.equal(await encaminharMensagem(texto, { ...config, modoConversa: 'CHATBOT_DETERMINISTICO' }, publico, destinos), 'SEM_TRATADOR_ATIVO');
  assert.equal(await encaminharMensagem(clique, config, publico, destinos), 'CLIQUE_SEM_CONTEXTO');
  assert.equal(await encaminharMensagem(texto, config, publico, destinos), 'RESPOSTA_ESPECIAL_TRATADA');
  assert.equal(await encaminharMensagem(texto, config, publico, { ...destinos, respostaPendente: async () => false }), 'CONVERSA');
  assert.deepEqual(chamadas, ['clique', 'pendente', 'ia']);
});
