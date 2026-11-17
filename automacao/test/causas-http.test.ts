import assert from "node:assert/strict";
import test from "node:test";
import { classificarRespostaHttp, codigoHttpSeguro } from "../src/followup/causas-http.js";
import { codigoFalha, FalhaAtendimento } from "../src/followup/falhas.js";
import { HttpJson, FalhaIntegracao } from "../src/followup/http.js";
import { motivoSeguro } from "../src/operacao/diagnostico-followup.js";
import { explicarResultado } from "../painel/src/diagnostico.js";

test("HTTP preserva causa conhecida do CRM sem copiar dados externos", async () => {
  const http = new HttpJson(100, async () => new Response(JSON.stringify({
    title: "Chave de envio conflitante", detail: "URL/token/segredo-cliente",
  }), { status: 409 }));
  await assert.rejects(http.chamar("https://fixture.invalid", {}), (e) => {
    assert.equal(codigoFalha(e), "HTTP_409_RESERVA_CONFLITANTE");
    assert.ok(!String(e).includes("segredo"));
    return true;
  });
});

test("erro nao JSON ou corpo grande ainda preserva HTTP", async () => {
  for (const body of ["html nao esperado", "a".repeat(9000)]) {
    const http = new HttpJson(100, async () => new Response(body, { status: 503 }));
    await assert.rejects(http.chamar("https://fixture.invalid", {}), (e) => codigoFalha(e) === "HTTP_503");
  }
});

test("campo ausente e identificado por igualdade, sem expor valores rejeitados", () => {
  assert.equal(classificarRespostaHttp({ detail: "opcoes e obrigatorio para mensagens interativas" }), "OPCOES_OBRIGATORIAS");
  assert.equal(classificarRespostaHttp({ detail: "opcoes e obrigatorio para mensagens interativas token-segredo" }), undefined);
  assert.equal(classificarRespostaHttp({ title: "segredo" }), undefined);
  assert.equal(classificarRespostaHttp({ title: "__proto__", detail: "constructor" }), undefined);
  assert.equal(codigoHttpSeguro("HTTP_400_TOKEN_PRIVADO"), false);
});

test("fase separa falha de reserva CRM de falha de provedor", () => {
  assert.equal(codigoFalha(new FalhaAtendimento("RESERVAR_ENVIO_CRM", new FalhaIntegracao("HTTP_401"))), "RESERVAR_ENVIO_CRM_HTTP_401");
  assert.equal(motivoSeguro("REGISTRO_CRM_PENDENTE_HTTP_400_OPCOES_OBRIGATORIAS"), "REGISTRO_CRM_PENDENTE_HTTP_400_OPCOES_OBRIGATORIAS");
  assert.match(explicarResultado("REGISTRO_CRM_PENDENTE_HTTP_400_OPCOES_OBRIGATORIAS"), /sem opcoes/);
});
