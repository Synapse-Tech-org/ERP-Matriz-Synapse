import assert from "node:assert/strict";
import test from "node:test";
import type { PedidoMensagem } from "../src/followup/contratos.js";
import { criarProvedorFollowup } from "../src/followup/provedores.js";
import type { ConfiguracaoProvedor, EnvioWhatsApp } from "../src/followup/provedores/contratos.js";
import { EvolutionFollowup } from "../src/followup/provedores/evolution.js";
import { MetaFollowup } from "../src/followup/provedores/meta.js";
import { ZApiFollowup } from "../src/followup/provedores/z-api.js";
import { WhatsAppFollowup } from "../src/followup/provedores/whatsapp-followup.js";
import type { TransporteJson } from "../src/followup/http.js";

const pedido: PedidoMensagem = {
  telefone: "5561999990000",
  texto: "Podemos ajudar?",
  botoes: [{ id: "sim", titulo: "Sim" }, { id: "nao", titulo: "Nao" }],
};

function transporte(resposta: unknown) {
  const chamadas: { url: string; headers: Record<string, string>; corpo: unknown }[] = [];
  const http: TransporteJson = {
    async chamar(url, headers, corpo) {
      chamadas.push({ url, headers, corpo });
      return resposta;
    },
  };
  return { http, chamadas };
}

test("Evolution isolada preserva rota, autenticacao, botoes e comprovante", async () => {
  const t = transporte({ key: { fromMe: true, id: "evo-1" } });
  const canal = new EvolutionFollowup({
    tipo: "evolution", base: "https://evo.invalid", instancia: "teste/um", token: "fixture",
  }, t.http);
  assert.equal(await canal.enviar(pedido), "evo-1");
  assert.deepEqual(t.chamadas, [{
    url: "https://evo.invalid/message/sendButtons/teste%2Fum",
    headers: { apikey: "fixture" },
    corpo: {
      number: pedido.telefone, title: pedido.texto, footer: "",
      buttons: [{ type: "reply", displayText: "Sim", id: "sim" }, { type: "reply", displayText: "Nao", id: "nao" }],
    },
  }]);
});

test("Meta isolada preserva contrato interativo e nao usa formato Evolution", async () => {
  const t = transporte({ messages: [{ id: "wamid.fixture" }] });
  const canal = new MetaFollowup({
    tipo: "meta", base: "https://meta.invalid/v21.0", numero: "numero/um", token: "fixture",
  }, t.http);
  assert.equal(await canal.enviar(pedido), "wamid.fixture");
  assert.deepEqual(t.chamadas, [{
    url: "https://meta.invalid/v21.0/numero%2Fum/messages",
    headers: { Authorization: "Bearer fixture" },
    corpo: {
      messaging_product: "whatsapp", to: pedido.telefone, type: "interactive",
      interactive: {
        type: "button", body: { text: pedido.texto },
        action: { buttons: [{ type: "reply", reply: { id: "sim", title: "Sim" } }, { type: "reply", reply: { id: "nao", title: "Nao" } }] },
      },
    },
  }]);
});

for (const clientToken of ["cliente-fixture", ""]) {
  test(`Z-API isolada preserva contrato e Client-Token ${clientToken ? "presente" : "ausente"}`, async () => {
    const t = transporte({ messageId: "z-1" });
    const canal = new ZApiFollowup({
      tipo: "z-api", base: "https://z.invalid", instancia: "teste/um", token: "token/um", clientToken,
    }, t.http);
    assert.equal(await canal.enviar(pedido), "z-1");
    assert.deepEqual(t.chamadas, [{
      url: "https://z.invalid/instances/teste%2Fum/token/token%2Fum/send-button-actions",
      headers: clientToken ? { "Client-Token": clientToken } : {},
      corpo: {
        phone: pedido.telefone, message: pedido.texto,
        buttonActions: [{ id: "sim", type: "REPLY", label: "Sim" }, { id: "nao", type: "REPLY", label: "Nao" }],
      },
    }]);
  });
}

const configuracoes: ConfiguracaoProvedor[] = [
  { tipo: "evolution", base: "https://fixture.invalid", instancia: "teste", token: "fixture" },
  { tipo: "meta", base: "https://fixture.invalid", numero: "teste", token: "fixture" },
  { tipo: "z-api", base: "https://fixture.invalid", instancia: "teste", token: "fixture", clientToken: "fixture" },
];
for (const config of configuracoes) {
  test(`${config.tipo}: a fabrica aplica a mesma restricao antes de qualquer HTTP`, async () => {
    const t = transporte({});
    const provedor = criarProvedorFollowup(config, t.http, { habilitada: true, numeros: [] });
    await assert.rejects(provedor.enviar(pedido), /NUMERO_NAO_PERMITIDO/);
    assert.equal(t.chamadas.length, 0);
  });
}

test("validacao compartilhada aceita um adaptador novo sem conhecer sua API", async () => {
  let chamadas = 0;
  const canal: EnvioWhatsApp = { async enviar(p) { chamadas++; assert.equal(p, pedido); return "novo-1"; } };
  const provedor = new WhatsAppFollowup(canal, { habilitada: true, numeros: [pedido.telefone] });
  await assert.rejects(provedor.enviar({ ...pedido, texto: "" }), /TEXTO_INTERATIVO_INVALIDO/);
  assert.equal(chamadas, 0);
  assert.equal(await provedor.enviar(pedido), "novo-1");
  assert.equal(chamadas, 1);
});

test("falha no canal permanece falha sem retry nem fallback para outra API", async () => {
  let chamadas = 0;
  const erro = new Error("HTTP_503");
  const provedor = new WhatsAppFollowup({ async enviar() { chamadas++; throw erro; } }, { habilitada: false, numeros: [] });
  await assert.rejects(provedor.enviar(pedido), (e) => e === erro);
  assert.equal(chamadas, 1);
});
