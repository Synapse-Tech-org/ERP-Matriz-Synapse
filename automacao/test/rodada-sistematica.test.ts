import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { RodadaSistematica } from "../src/sistematicas/rodada.js";
import { PADROES } from "../src/sistematicas/regras.js";

// Exercita a mesma entrada chamada pelo worker, sem tocar em banco ou canal real.
test("categorias independentes, bloqueio por numero e conciliacao sem repetir WhatsApp", async () => {
  const enviados: string[] = [], reservas = new Set<string>();
  const pendentes = new Map<string, {chave:string;atendimento:string;texto:string;provedor_id:string}>();
  const rodadas: Record<string,number>[] = [];
  const db = { async query(sql:string,v:unknown[] = []) {
    if (sql.startsWith("SELECT chave")) return {rows:[...pendentes.values()]};
    if (sql.includes("SET status='REGISTRO_PENDENTE'")) {
      const chave=String(v[0]); pendentes.set(chave,{chave,atendimento:"at",texto:"Ola",provedor_id:String(v[1])});
    }
    if (sql.includes("SET status='ENVIADO'")) pendentes.delete(String(v[0]));
    if (sql.includes("SET finalizado_em=")) rodadas.push(v[2] as Record<string,number>);
    return {rowCount:1,rows:[]};
  }} as unknown as Pool;
  let aceitaRegistro=false;
  const crm = {
    async configuracao(){ return {politica:PADROES,expediente:[],parametros:new Map()}; },
    async catalogo(){ return {ids:new Set(["lead"]),aniversario:"Aniversario",festivas:[{id:"f",mensagem:"Festiva"}],
      regras:[{id:"r",mensagem:"Inatividade",diasSemContato:30}]}; },
    async reservar(_lead:string,_p:unknown,chave:string){if(reservas.has(chave))return false;reservas.add(chave);return true;},
    async registrar(){if(!aceitaRegistro)throw new Error("offline");return "crm-id";}
  };
  const lead={id:"lead",nome:"Ana",telefone:"12345678",status:"EM_IA",atendimentoId:"at",criadoEm:"2025-01-01",ultimaInteracaoEm:null,ultimaEntradaEm:null};
  const rodada=new RodadaSistematica(db,crm,{async pagina(){return [lead,{...lead,id:"outro",telefone:"99999999"}];}},
    {async enviar(n,t){assert.equal(n,lead.telefone);enviados.push(t);return "wa-"+enviados.length;}},
    new Set([lead.telefone]),"UTC",false,()=>new Date("2026-11-23T12:00:00Z"));
  await rodada.executar();
  assert.deepEqual(enviados,["Aniversario","Festiva","Inatividade"]);
  assert.deepEqual(rodadas[0],{REGISTRO_PENDENTE:3,FORA_DO_PUBLICO:1});
  aceitaRegistro=true;
  await rodada.executar();
  assert.equal(pendentes.size,0);
  assert.equal(enviados.length,3);
  assert.equal(rodadas[1]?.ACEITO_E_REGISTRADO,3);
});
