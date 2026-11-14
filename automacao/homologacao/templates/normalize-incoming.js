// Traduz o evento Evolution recebido do CRM para o contrato dos subfluxos legados.
// A autenticacao e feita pelo node Webhook com Header Auth, nao pelo corpo enviado.
const entrada = $('Receber evento').first().json;
const corpo = entrada.body ?? entrada;
const data = corpo.data;
const ignorar = codigo => [{ json: { headers: entrada.headers || {}, body: { entry: [] }, hml_evolution_validado: true, codigo } }];
if (corpo.event !== 'messages.upsert' || corpo.instance !== 'instancia_numero_teste') return ignorar('EVENTO_OU_INSTANCIA_IGNORADO');
if (!data || Array.isArray(data) || !data.key?.id || data.key.fromMe !== false) return ignorar('SEM_MENSAGEM_RECEBIDA');
const candidatos = [data.key.remoteJid, data.key.remoteJidAlt];
if (candidatos.some(j => String(j || '').endsWith('@g.us'))) return ignorar('GRUPO_IGNORADO');
const jid = candidatos.find(j => /^\d+@s\.whatsapp\.net$/.test(String(j || '')));
if (!jid) return ignorar('TELEFONE_NAO_RESOLVIDO');
let conteudo = data.message || {};
for (let i = 0; i < 3; i++) conteudo = conteudo.ephemeralMessage?.message || conteudo.viewOnceMessage?.message || conteudo.viewOnceMessageV2?.message || conteudo;
const m = { id: String(data.key.id), from: jid.split('@')[0], timestamp: String(data.messageTimestamp || Math.floor(Date.now()/1000)) };
const texto = conteudo.conversation || conteudo.extendedTextMessage?.text;
const botao = conteudo.buttonsResponseMessage || conteudo.templateButtonReplyMessage;
const lista = conteudo.listResponseMessage;
if (botao) {
  m.type = 'interactive'; m.interactive = { type: 'button_reply', button_reply: { id: botao.selectedButtonId || botao.selectedId, title: botao.selectedDisplayText || '' } };
} else if (lista) {
  m.type = 'interactive'; m.interactive = { type: 'list_reply', list_reply: { id: lista.singleSelectReply?.selectedRowId, title: lista.title || '', description: lista.description || '' } };
} else if (conteudo.interactiveResponseMessage?.nativeFlowResponseMessage) {
  let p; try { p = JSON.parse(conteudo.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson); }
  catch { return ignorar('RESPOSTA_INTERATIVA_INVALIDA'); }
  const row = p.selectedRowId || p.selected_row_id;
  m.type = 'interactive'; m.interactive = row
    ? { type: 'list_reply', list_reply: { id: row, title: p.title || p.display_text || '' } }
    : { type: 'button_reply', button_reply: { id: p.id || p.selected_id, title: p.display_text || p.title || '' } };
} else if (texto) { m.type = 'text'; m.text = { body: texto }; }
else {
  const formato = [['audioMessage','audio'],['imageMessage','image'],['documentMessage','document']].find(([key]) => conteudo[key]);
  if (!formato) return ignorar('FORMATO_NAO_SUPORTADO');
  const media = conteudo[formato[0]]; m.type = formato[1];
  m[m.type] = { id: m.id, mime_type: media.mimetype || '', filename: media.fileName || '', caption: media.caption || '' };
}
return [{ json: { headers: entrada.headers || {}, hml_evolution_validado: true,
  body: { entry: [{ changes: [{ value: { metadata: { display_phone_number: '556198897431', phone_number_id: 'instancia_numero_teste' },
    contacts: [{ wa_id: m.from, profile: { name: data.pushName || '' } }], messages: [m] } }] }] } } }];
