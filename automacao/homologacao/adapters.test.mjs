import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
function execute(file, inputs) {
  const code=fs.readFileSync(path.join(here,'templates',file),'utf8');
  const select=name=>({first:()=>({json:inputs[name]}),item:{json:inputs[name]}});
  return new Function('$',code)(select);
}
const phone='5511999999999';
const config={envios_habilitados:true,numeros_permitidos:phone,evolution_base_url:'https://evolution-hml.187.77.47.30.sslip.io',evolution_instancia:'instancia_numero_teste'};
function send(payload, settings=config){return execute('prepare-send.js',{'Entrada':{payload},'Configuracao HML':settings})[0].json;}
function incoming(message, overrides={}){
  return execute('normalize-incoming.js',{'Receber evento':{body:{event:'messages.upsert',instance:'instancia_numero_teste',
    data:{key:{id:'TEST-ID',remoteJid:phone+'@s.whatsapp.net',fromMe:false},message,messageTimestamp:1794211200},...overrides}}})[0].json;
}
test('texto usa Evolution e mantem conteudo',()=>{
  const r=send({type:'text',to:phone,text:{body:'Teste'}});assert.match(r.url,/message\/sendText\/instancia_numero_teste$/);assert.equal(r.body.text,'Teste');
});
test('envio desligado bloqueia antes do HTTP',()=>assert.throws(()=>send({type:'text',to:phone,text:{body:'Teste'}},{...config,envios_habilitados:false}),/DESLIGADOS/));
test('destinatario fora da lista nao envia',()=>assert.throws(()=>send({type:'text',to:'5511888888888',text:{body:'Teste'}}),/FORA_DA_LISTA/));
test('botoes preservam IDs e rotulos',()=>{
  const r=send({type:'interactive',to:phone,interactive:{type:'button',body:{text:'Continuar?'},action:{buttons:[{reply:{id:'sim',title:'Sim'}},{reply:{id:'nao',title:'Nao'}}]}}});
  assert.match(r.url,/sendButtons/);assert.deepEqual(r.body.buttons.map(b=>b.id),['sim','nao']);
});
test('lista preserva rowId',()=>{
  const r=send({type:'interactive',to:phone,interactive:{type:'list',body:{text:'Escolha'},action:{button:'Equipe',sections:[{title:'Equipe',rows:[{id:'pessoa',title:'Pessoa'}]}]}}});
  assert.equal(r.body.sections[0].rows[0].rowId,'pessoa');
});
test('template nao vira texto silenciosamente',()=>assert.throws(()=>send({type:'template',to:phone,template:{name:'aniversario'}}),/NAO_ADAPTADO/));
test('entrada traduz texto e remetente',()=>{const r=incoming({conversation:'Oi'});const m=r.body.entry[0].changes[0].value.messages[0];assert.equal(m.from,phone);assert.equal(m.text.body,'Oi');});
test('entrada traduz resposta de botao',()=>{const r=incoming({buttonsResponseMessage:{selectedButtonId:'ev06_followup_nao',selectedDisplayText:'Nao'}});assert.equal(r.body.entry[0].changes[0].value.messages[0].interactive.button_reply.id,'ev06_followup_nao');});
test('entrada traduz nativeFlow',()=>{const r=incoming({interactiveResponseMessage:{nativeFlowResponseMessage:{paramsJson:JSON.stringify({id:'sim',display_text:'Sim'})}}});assert.equal(r.body.entry[0].changes[0].value.messages[0].interactive.button_reply.id,'sim');});
test('ignora instancia diferente',()=>assert.deepEqual(incoming({conversation:'Oi'},{instance:'producao'}).body.entry,[]));
test('ignora mensagens proprias',()=>assert.deepEqual(incoming({}, {data:{key:{id:'x',fromMe:true,remoteJid:phone+'@s.whatsapp.net'},message:{conversation:'Oi'}}}).body.entry,[]));
test('ignora grupos',()=>assert.deepEqual(incoming({}, {data:{key:{id:'x',fromMe:false,remoteJid:'123@g.us'},message:{conversation:'Oi'}}}).body.entry,[]));
test('LID sem telefone nao vira numero',()=>assert.deepEqual(incoming({}, {data:{key:{id:'x',fromMe:false,remoteJid:'123@lid'},message:{conversation:'Oi'}}}).body.entry,[]));
test('JSON interativo invalido nao interrompe outros eventos',()=>assert.deepEqual(incoming({interactiveResponseMessage:{nativeFlowResponseMessage:{paramsJson:'invalid'}}}).body.entry,[]));

test('exports sem pinData, staticData, JWTs ou destinos antigos',()=>{
  const directory=path.join(here,'fluxos');if(!fs.existsSync(directory))return;
  for(const filename of fs.readdirSync(directory).filter(x=>x.endsWith('.json'))){
    const text=fs.readFileSync(path.join(directory,filename),'utf8');const w=JSON.parse(text);
    assert.equal(w.active,false);assert.equal(w.pinData,undefined);assert.equal(w.staticData,undefined);
    assert.doesNotMatch(text,/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
    assert.doesNotMatch(text,/https?:\/\/(?:graph\.facebook\.com|n8n\.187\.77\.47\.30|crm\.187\.77\.47\.30)/);
    const names=new Set(w.nodes.map(n=>n.name));assert.equal(names.size,w.nodes.length);
    for(const [name,types] of Object.entries(w.connections)){assert.ok(names.has(name),name);
      for(const groups of Object.values(types))for(const group of groups)for(const e of group)assert.ok(names.has(e.node),e.node);}
    for(const n of w.nodes)if(n.parameters.jsCode)new (Object.getPrototypeOf(async function(){}).constructor)(n.parameters.jsCode);
    for(const n of w.nodes)if(n.type==='n8n-nodes-base.httpRequest' && String(n.parameters.url).includes('/internal/v1')) {
      assert.match(n.parameters.url,/synapse-backend-internal:8080/);
    }
  }
});
