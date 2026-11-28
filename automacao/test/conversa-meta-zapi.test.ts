import assert from 'node:assert/strict';
import test from 'node:test';
import { EntradaMeta } from '../src/conversa/meta.js';
import { EntradaZApi } from '../src/conversa/z-api.js';

test('Meta separa mensagens do lote e preserva a identidade do clique, nao dos status', () => {
  const from = '5511999990000';
  const messages = [
    { from, id: 'a', type: 'text', text: { body: 'Nao' } },
    { from, id: 'b', type: 'interactive', context: { id: 'menu' },
      interactive: { type: 'list_reply', list_reply: { id: 'fila', title: 'Equipe' } } },
    { from, id: 'c', group_id: 'grupo', type: 'text', text: { body: 'ignorar' } },
  ];
  const changes = ['outro', 'canal'].map(numero => ({ field: 'messages',
    value: { metadata: { phone_number_id: numero }, messages, statuses: [{ id: 's' }] } }));
  const eventos = new EntradaMeta('canal').normalizar({ object: 'whatsapp_business_account', entry: [{ changes }] });
  assert.deepEqual(eventos.map(e => e.mensagemId), ['a', 'b']);
  assert.equal(eventos[1]?.mensagemRespondidaId, 'menu');
  assert.deepEqual(eventos[1]?.conteudo, { tipo: 'clique', origem: 'lista', opcaoId: 'fila', rotulo: 'Equipe' });
});

test('Z-API nao confunde um clique com texto nem processa callbacks de entrega ou eco', () => {
  const adaptador = new EntradaZApi('teste');
  const msg = { instanceId: 'teste', type: 'ReceivedCallback', fromMe: false, messageId: 'clique',
    referenceMessageId: 'pergunta', momment: 1, phone: '5511999990000', text: { message: 'Nao' },
    buttonsResponseMessage: { buttonId: 'recusar', message: 'Nao' } };
  const [evento] = adaptador.normalizar(msg);
  assert.equal(evento?.mensagemRespondidaId, 'pergunta');
  assert.deepEqual(evento?.conteudo, { tipo: 'clique', origem: 'botao', opcaoId: 'recusar', rotulo: 'Nao' });
  for (const alteracao of [{ type: 'DeliveryCallback' }, { fromMe: true }, { instanceId: 'outra' },
    { isGroup: true }, { buttonsResponseMessage: {} }, { pollVote: {} }]) {
    assert.deepEqual(adaptador.normalizar({ ...msg, ...alteracao }), []);
  }
});
