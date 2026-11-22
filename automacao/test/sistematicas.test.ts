import test from "node:test";
import assert from "node:assert/strict";
import { calendario, dentroDoExpediente, fidelizacao, lerPolitica, personalizar, type Lead } from "../src/sistematicas/regras.js";
import { criarCanal, publicoDeTeste } from "../src/sistematicas/canal.js";

const agora = new Date("2026-11-23T12:00:00Z");
const padrao = lerPolitica(new Map());
const lead: Lead = { id:"a",telefone:"12345678",nome:"Ana",atendimentoId:"b",status:"FINALIZADO",
  criadoEm:"2026-01-01T12:00:00Z",ultimaInteracaoEm:null,ultimaEntradaEm:null };
const regras = [30,60,90].map(n=>({id:String(n),diasSemContato:n,mensagem:"Oi [nome]"}));

test("finalizado fica de fora, exceto quando o CRM permite",()=>{
  assert.deepEqual(padrao,{excluirFinalizados:true,somenteHorarioComercial:false});
  assert.equal(fidelizacao(lead,regras,padrao,agora),undefined);
  const politica=lerPolitica(new Map([["fidelizacao.excluir_finalizados","false"]]));
  assert.equal(fidelizacao(lead,regras,politica,agora)?.regra,"90");
  assert.throws(()=>lerPolitica(new Map([["fidelizacao.excluir_finalizados","talvez"]])));
});
test("interacao de saida move o prazo, mas nao renova o ciclo da faixa",()=>{
  const aberto={...lead,status:"EM_IA",ultimaInteracaoEm:"2026-10-20T12:00:00Z"};
  const primeira=fidelizacao(aberto,regras,padrao,agora)!;
  assert.equal(primeira.regra,"30");
  const depois={...aberto,ultimaInteracaoEm:agora.toISOString()};
  assert.equal(fidelizacao(depois,regras,padrao,agora),undefined);
  const segunda=fidelizacao(depois,regras,padrao,new Date("2027-01-22T12:00:00Z"))!;
  assert.equal(segunda.regra,"60");
  assert.equal(primeira.ciclo,segunda.ciclo);
});
test("expediente usa dia e hora locais e nao inclui a hora de fechamento",()=>{
  const janela=[{dia:1,inicio:"09:00",fim:"18:00"}];
  for(const [data,ok] of [["2026-11-23T11:59:00Z",false],["2026-11-23T12:00:00Z",true],["2026-11-23T21:00:00Z",false]] as const)
    assert.equal(dentroDoExpediente(calendario(new Date(data),"America/Sao_Paulo"),janela),ok);
  assert.equal(dentroDoExpediente(calendario(agora,"UTC"),[]),false);
});
test("homologacao nao tem fallback de publico nem de mensagem",()=>{
  for(const v of [undefined,"","12345678,invalido"]) assert.throws(()=>publicoDeTeste(v));
  assert.equal(publicoDeTeste("12345678").has("9912345678"),false);
  assert.equal(personalizar("Oi {nome}",""),null);
  assert.equal(personalizar("Oi [nome]","Ana"),"Oi Ana");
});
test("cada canal usa seu proprio formato e exige comprovante",async()=>{
  for(const tipo of ["evolution","z-api","meta"] as const){
    let payload:unknown;
    const canal=criarCanal({tipo,base:"https://example.test",token:"fixture",numero:"1",instancia:"fixture",clientToken:"fixture"} as import("../src/followup/provedores.js").ConfiguracaoProvedor,
      {async chamar(_url,_headers,body){payload=body;return {messages:[{id:"aceito"}],messageId:"aceito",key:{fromMe:true,id:"aceito"}};}});
    assert.equal(await canal.enviar("12345678","Oi Ana",{nome:"especial",idioma:"pt_BR",parametro:"texto"}),"aceito");
    if(tipo==="meta") assert.equal((payload as {template:{name:string}}).template.name,"especial");
    else if(tipo==="evolution") assert.deepEqual(payload,{number:"12345678",text:"Oi Ana"});
    else assert.deepEqual(payload,{phone:"12345678",message:"Oi Ana"});
  }
});
