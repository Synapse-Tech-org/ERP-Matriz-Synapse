import test from "node:test";
import assert from "node:assert/strict";
import { chavesPrompt, lerPrompts } from "../src/conversa/agente/prompts.js";

test("prompts exigem uma configuracao completa e inequivoca por turno", () => {
  const linhas = Object.values(chavesPrompt).map(chave => ({chave,valor:"Texto: "+chave}));
  assert.equal(lerPrompts(linhas).triagem, "Texto: "+chavesPrompt.triagem);
  assert.throws(()=>lerPrompts(linhas.slice(1)),/PROMPT_NAO_CONFIGURADO/);
  assert.throws(()=>lerPrompts([...linhas,...linhas]),/PROMPT_NAO_CONFIGURADO/);
  assert.throws(()=>lerPrompts(linhas.map(p=>({...p,valor:" "}))),/PROMPT_NAO_CONFIGURADO/);
});
