import test from "node:test";
import assert from "node:assert/strict";
import {chaveBuffer} from "../src/conversa/buffer-redis.js";
import {extrairTextoPdf} from "../src/conversa/documento-pdf.js";
import {modeloOpenAI} from "../src/conversa/agente/openai.js";

test("buffer isola filhos e nao expoe o identificador na chave",()=>{
  assert.notEqual(chaveBuffer("filho1","123"),chaveBuffer("filho2","123"));
  assert.match(chaveBuffer("filho1","123"),/^automacao:conversa:v1:[a-f0-9]{64}$/);
  assert.throws(()=>chaveBuffer("","123"));
});
test("extrator rejeita outros formatos e limita entrada antes de abrir processo",async()=>{
  await assert.rejects(extrairTextoPdf(Buffer.from("documento")),/DOCUMENTO_NAO_PDF/);
  await assert.rejects(extrairTextoPdf(Buffer.alloc(8*1024*1024+1)),/PDF_EXCEDE_LIMITE/);
});
test("modelo nao inicializa sem segredo do servidor",()=>{
  assert.throws(()=>modeloOpenAI({}),/OPENAI_API_KEY_AUSENTE/);
});
