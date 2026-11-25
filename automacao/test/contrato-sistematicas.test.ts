import test from "node:test";
import assert from "node:assert/strict";
import { CrmSistematicas } from "../src/sistematicas/crm.js";
import { dentroDoExpediente } from "../src/sistematicas/regras.js";

// Valores iniciais da V127 do CRM. O DTO devolve valor como string, nao boolean.
const parametros = [
  ["fidelizacao.excluir_finalizados", "true"],
  ["sistematicas.somente_horario_comercial", "false"],
  ["sistematicas.expediente", "[]"],
  ["sistematicas.meta.template_nome", ""],
  ["sistematicas.meta.template_idioma", ""],
  ["sistematicas.meta.parametro_texto", ""],
].map(([chave, valor]) => ({ chave, valor }));

function cliente(restrito = false) {
  return new CrmSistematicas("https://crm.example.test", "fixture", {
    async chamar(url, headers) {
      assert.equal(url, "https://crm.example.test/internal/v1/automation-config");
      assert.equal(headers["X-Synapse-Token"], "fixture");
      return {
        exigeTemplateForaDaJanela: false,
        parametros: parametros.map(p => restrito && p.chave === "sistematicas.somente_horario_comercial"
          ? { ...p, valor: "true" } : p),
      };
    },
  });
}

test("contrato V127: seis parametros string e templates vazios aceitos na configuracao", async () => {
  const config = await cliente().configuracao();
  assert.deepEqual(config.politica, { excluirFinalizados: true, somenteHorarioComercial: false });
  assert.equal(config.parametros.size, 6);
  assert.deepEqual(config.expediente, []);
  assert.equal(config.parametros.get("sistematicas.meta.template_nome"), "");
});

test("contrato V127: restringir horario sem expediente nao libera envio", async () => {
  const config = await cliente(true).configuracao();
  assert.equal(config.politica.somenteHorarioComercial, true);
  assert.equal(dentroDoExpediente({ data: "2026-11-24", dia: 2, hora: "10:00" }, config.expediente), false);
});
