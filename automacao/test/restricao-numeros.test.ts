import test from "node:test";
import assert from "node:assert/strict";
import { carregarRestricaoNumeros as carregar } from "../src/compartilhado/restricao-numeros.js";

test("sem env, bloqueia todos e ignora a configuracao global do CRM", () => {
  assert.deepEqual(carregar({ WHATSAPP_RESTRICAO_NUMEROS_HABILITADA: "false", WHATSAPP_NUMEROS_PERMITIDOS: "5511999999999" }),
    { habilitada: true, numeros: [] });
});
test("lista exclusiva, exata, compartilhada e sem fallback legado", () => {
  const r = carregar({ AUTOMACAO_NUMEROS_TESTE: "5511999999999,5511999999999" });
  assert.deepEqual(r.numeros, ["5511999999999"]);
  assert.equal(r.numeros.includes("11999999999"), false);
  assert.deepEqual(carregar({ AUTOMACAO_SISTEMATICAS_NUMEROS_TESTE: "5511999999999" }).numeros, []);
});
test("desativacao explicita e rejeicao de entradas invalidas", () => {
  assert.equal(carregar({ AUTOMACAO_RESTRICAO_NUMEROS_HABILITADA: "false" }).habilitada, false);
  assert.throws(() => carregar({ AUTOMACAO_RESTRICAO_NUMEROS_HABILITADA: "1" }));
  for (const n of ["abc", "5511999999999,invalido", "5511999999999,", "+5511999999999"])
    assert.throws(() => carregar({ AUTOMACAO_NUMEROS_TESTE: n }));
});
