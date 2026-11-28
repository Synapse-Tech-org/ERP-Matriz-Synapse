import test from "node:test";
import assert from "node:assert/strict";
import { preencherContexto } from "../src/conversa/agente/prompts.js";
import { canalDeConversa } from "../src/conversa/envio-texto.js";
import { DistribuicaoCrm } from "../src/conversa/crm/distribuicao.js";

test("contexto nao executa n8n nem reinterpreta o texto da FAQ",()=>{
  assert.equal(preencherContexto("FAQ: {{faq}}",{faq:"{{equipe}}"}),"FAQ: {{equipe}}");
  assert.throws(()=>preencherContexto("{{ $('node') }}",{}));
});

test("dia sem equipe mantem lista vazia; configuracao nao e inferida por tenant",async()=>{
  const adapter=new DistribuicaoCrm({chamar:async url=>url.endsWith("disponiveis")?[]:
    {parametros:[{chave:"transferencia.por_lista",valor:"false"}]}},"https://crm.invalid","teste");
  const config = await adapter.consultar();
  assert.equal(config.porLista,false);
  assert.deepEqual(config.equipe,[]);
  assert.equal(config.politicas.apresentar,false);
});

test("resposta Meta usa texto, protege publico e devolve o comprovante",async()=>{
  let chamadas=0;
  const canal=canalDeConversa({tipo:"meta",base:"https://teste.invalid",numero:"123",token:"teste"},
    {chamar:async (_url,_h,corpo)=>{chamadas++;assert.deepEqual(corpo,{messaging_product:"whatsapp",
      to:"5511999999999",type:"text",text:{body:"Oi"}});return {messages:[{id:"teste"}]};}},
    {habilitada:true,numeros:["5511999999999"]});
  await assert.rejects(canal.enviar("5511999999998","Oi"),/NUMERO_NAO_PERMITIDO/);
  assert.equal(await canal.enviar("5511999999999","Oi"),"teste");
  assert.equal(chamadas,1);
});
