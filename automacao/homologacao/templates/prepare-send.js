// Traduz o contrato legado Meta para Evolution. Este node nao chama APIs.
const entrada = $('Entrada').item.json;
const config = $('Configuracao HML').first().json;
if (config.envios_habilitados !== true) throw new Error('HML_ENVIOS_DESLIGADOS: revisar antes de habilitar.');
const payload = typeof entrada.payload === 'string' ? JSON.parse(entrada.payload) : entrada.payload;
if (!payload || typeof payload !== 'object') throw new Error('PAYLOAD_INVALIDO');
const number = String(payload.to || entrada.destinatario || '').replace(/\D/g, '');
const permitidos = String(config.numeros_permitidos || '').split(/[,;\s]+/).map(v => v.replace(/\D/g, '')).filter(Boolean);
if (!number || !permitidos.includes(number)) throw new Error('DESTINATARIO_FORA_DA_LISTA_HML');
let route;
let body;
if (payload.typing_indicator || payload.status === 'read') {
  // Presenca nao significa que a mensagem recebida foi marcada como lida.
  route = 'chat/sendPresence'; body = { number, delay: 1000, presence: 'composing' };
} else if (payload.type === 'text') {
  route = 'message/sendText'; body = { number, text: payload.text?.body, linkPreview: Boolean(payload.text?.preview_url) };
  if (!body.text) throw new Error('TEXTO_VAZIO');
} else if (payload.type === 'interactive' && payload.interactive?.type === 'button') {
  const i = payload.interactive; route = 'message/sendButtons';
  body = { number, title: i.body?.text, footer: i.footer?.text || '',
    buttons: (i.action?.buttons || []).map(b => ({ type: 'reply', displayText: b.reply?.title, id: b.reply?.id })) };
  if (!body.title || !body.buttons.length || body.buttons.length > 3 || body.buttons.some(b => !b.id || !b.displayText)) throw new Error('BOTOES_INVALIDOS');
} else if (payload.type === 'interactive' && payload.interactive?.type === 'list') {
  const i = payload.interactive; route = 'message/sendList';
  body = { number, title: i.header?.text || '', description: i.body?.text, buttonText: i.action?.button, footerText: i.footer?.text || '',
    sections: (i.action?.sections || []).map(s => ({ title: s.title, rows: (s.rows || []).map(r => ({ title: r.title, description: r.description || '', rowId: r.id })) })) };
  if (!body.description || !body.buttonText || !body.sections.length) throw new Error('LISTA_INVALIDA');
} else {
  // Um template Meta nao pode virar texto livre sem definir seu conteudo e sua regra.
  throw new Error('FORMATO_NAO_ADAPTADO_EVOLUTION: ' + String(payload.type));
}
return [{ json: { url: config.evolution_base_url.replace(/\/$/, '') + '/' + route + '/' + encodeURIComponent(config.evolution_instancia), body, presenca: route === 'chat/sendPresence' } }];
