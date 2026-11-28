import test from "node:test";
import assert from "node:assert/strict";
import { instrucoesPerfil, validarPerfil } from "../src/conversa/agente/perfil.js";
import { politicasConversa, instrucoesDoTurno } from "../src/conversa/agente/politicas.js";

test("perfil ausente preserva o texto original e o painel rejeita escolhas invalidas",()=>{
  assert.equal(instrucoesPerfil([]),"");
  assert.equal(validarPerfil("ia.perfil.tom",""),true);
  assert.equal(validarPerfil("ia.perfil.tom","inventado"),false);
  assert.match(instrucoesPerfil([{chave:"ia.perfil.nome",valor:"Teste"}]),/Teste/);
});
test("apresentacao so no primeiro contato; zero de atraso e valido",()=>{
  const p=politicasConversa([{chave:"ia.comportamento.apresentar_assistente_virtual",valor:"true"},
    {chave:"ia.resposta.atraso_segundos",valor:"0"}]);
  assert.match(instrucoesDoTurno(p,true),/virtual/);
  assert.equal(instrucoesDoTurno(p,false),"");
  assert.equal(p.atraso,0);
  assert.throws(()=>politicasConversa([{chave:"ia.contexto.mensagens",valor:"101"}]));
});
