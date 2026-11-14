import test from "node:test";
import assert from "node:assert/strict";
import {
  avaliarFollowup,
  mesmaConversa,
  renderizar,
} from "../src/followup/avaliar.js";
import { lerRegrasCrm } from "../src/followup/configuracao-crm.js";
import { carregarFollowup } from "../src/followup/configuracao.js";
import { HttpJson } from "../src/followup/http.js";
import { CrmHttpFollowup } from "../src/followup/crm-http.js";
import { WhatsAppFollowup } from "../src/followup/provedores.js";
import { ProcessarAtendimento } from "../src/followup/processar-atendimento.js";
import type {
  AtendimentoFollowup,
  ControleFollowup,
  CrmFollowup,
  EnvioRegistrado,
  RegrasDaRodada,
} from "../src/followup/contratos.js";

const agora = Date.parse("2026-11-10T15:00:00Z");
const regra = {
  id: "r1",
  nome: "Primeira",
  tempoMinutos: 10,
  texto: "Ola {{nome}}, podemos continuar?",
};
const bruto = { parametros: [], exigeTemplateForaDaJanela: false };
const config = (): RegrasDaRodada =>
  lerRegrasCrm(bruto, [regra], { exigeJanela: false });
const atendimento = (): AtendimentoFollowup => ({
  id: "a1",
  leadId: "l1",
  nome: "Ana",
  telefone: "5561999990000",
  status: "EM_IA",
  ultima: {
    id: "m2",
    em: "2026-11-10T14:00:00Z",
    remetente: "IA",
    texto: "Bom dia",
    status: "ENVIADO",
  },
  ultimaDoLead: {
    id: "m1",
    em: "2026-11-10T13:50:00Z",
    remetente: "LEAD",
    texto: "",
    status: "ENVIADO",
  },
});
const comprovado = (): EnvioRegistrado => ({
  id: "e1",
  regraId: "r1",
  ciclo: "2026-11-10T13:50:00.000Z",
  status: "ENVIADO",
  texto: "Ola Ana, podemos continuar?",
  enviadoEm: "2026-11-10T14:00:00Z",
  encerradoEm: null,
  crmMensagemId: "m2",
});

test("CRM ausente usa defaults centralizados e registra quais foram usados", () => {
  const c = config();
  assert.equal(c.limiteEnvios, 10);
  assert.equal(c.encerrarAposMinutos, 30);
  assert.ok(c.padroesUtilizados.includes("followup.limite_envios_por_rodada"));
});
test("CRM zero e respeitado, nao trocado por fallback; vazio usa padrao", () => {
  const c = lerRegrasCrm(
    {
      ...bruto,
      parametros: [
        { chave: "followup.limite_envios_por_rodada", valor: "0" },
        { chave: "followup.encerrar_pos_followup_minutos", valor: " " },
      ],
    },
    [],
    { exigeJanela: false },
  );
  assert.equal(c.limiteEnvios, 0);
  assert.equal(c.encerrarAposMinutos, 30);
});
test("configuracao malformada nao e interpretada como CRM vazio", () => {
  assert.throws(() => lerRegrasCrm({}, [], { exigeJanela: false }));
  assert.throws(() =>
    lerRegrasCrm(bruto, [{ ...regra, tempoMinutos: 0 }], {
      exigeJanela: false,
    }),
  );
  assert.throws(() =>
    lerRegrasCrm(
      {
        ...bruto,
        parametros: [
          { chave: "followup.limite_envios_por_rodada", valor: "dez" },
        ],
      },
      [],
      { exigeJanela: false },
    ),
  );
});
test("IDs dos botoes aceitam env sem bifurcar codigo por cliente", () => {
  const c = lerRegrasCrm(bruto, [regra], {
    exigeJanela: false,
    botaoSimId: "outro_sim",
    botaoNaoId: "outro_nao",
  });
  assert.equal(c.botoes[1]!.id, "outro_nao");
});
test("regra local so substitui lista vazia e restringe lead", () => {
  const opcoes = { exigeJanela: false, teste: { leadId: "teste", regra } };
  assert.equal(lerRegrasCrm(bruto, [regra], opcoes).leadTeste, undefined);
  const c = lerRegrasCrm(bruto, [], opcoes);
  assert.deepEqual(avaliarFollowup(atendimento(), c, [], false, agora), {
    acao: "IGNORAR",
    motivo: "FORA_DO_LEAD_TESTE",
  });
});
test("sem regra CRM nem teste nao inventa mensagem de follow-up", () => {
  assert.deepEqual(lerRegrasCrm(bruto, [], { exigeJanela: false }).regras, []);
});
test("prioridade menor prazo ainda nao enviado, desempate estavel por ID", () => {
  const c = config();
  c.regras = [
    { ...regra, id: "z", tempoMinutos: 20 },
    { ...regra, id: "b" },
    { ...regra, id: "a" },
  ];
  const d = avaliarFollowup(atendimento(), c, [], false, agora);
  assert.equal(d.acao, "ENVIAR");
  if (d.acao === "ENVIAR") assert.equal(d.regra.id, "a");
});
test("renderiza nome completo e primeiro nome; nao compara preview truncada", () => {
  assert.equal(
    renderizar("{{primeiro_nome}} / {{nome}}", "Ana Silva"),
    "Ana / Ana Silva",
  );
  assert.equal(renderizar("Ola {NOME}!", "Ana Silva"), "Ola Ana Silva!");
  const a = atendimento();
  a.ultima!.texto = "Ola Ana, podemos continuar?";
  assert.equal(avaliarFollowup(a, config(), [], false, agora).acao, "IGNORAR");
});
for (const status of ["RESERVADO", "EM_ENVIO", "INCERTO"])
  test(`estado ${status} bloqueia novo envio e encerramento`, () => {
    assert.deepEqual(
      avaliarFollowup(
        atendimento(),
        config(),
        [{ ...comprovado(), status }],
        false,
        agora,
      ),
      { acao: "IGNORAR", motivo: "ENVIO_PENDENTE_OU_INCERTO" },
    );
  });
test("recusa compartilhada impede envio mesmo em ciclo novo", () => {
  assert.deepEqual(avaliarFollowup(atendimento(), config(), [], true, agora), {
    acao: "IGNORAR",
    motivo: "RECUSA_REGISTRADA",
  });
});
test("encerramento exige comprovante, prazo e mesma mensagem CRM", () => {
  const a = atendimento();
  a.ultima!.texto = comprovado().texto;
  assert.equal(
    avaliarFollowup(a, config(), [comprovado()], false, agora).acao,
    "ENCERRAR",
  );
  a.ultima!.id = "nova-mensagem-mesmo-texto";
  assert.equal(
    avaliarFollowup(a, config(), [comprovado()], false, agora).acao,
    "IGNORAR",
  );
});
test("resposta do cliente, atendimento finalizado e falha de entrega nao geram follow-up", () => {
  for (const alterar of [
    (a: AtendimentoFollowup) => {
      a.ultima!.remetente = "LEAD";
    },
    (a: AtendimentoFollowup) => {
      a.status = "FINALIZADO";
    },
    (a: AtendimentoFollowup) => {
      a.ultima!.status = "FALHOU";
    },
  ]) {
    const a = atendimento();
    alterar(a);
    assert.equal(
      avaliarFollowup(a, config(), [], false, agora).acao,
      "IGNORAR",
    );
  }
});
test("Meta respeita janela mesmo se CRM declarar que nao exige template", () => {
  const c = lerRegrasCrm(bruto, [regra], { exigeJanela: true });
  assert.deepEqual(
    avaliarFollowup(atendimento(), c, [], false, agora + 86400000),
    { acao: "IGNORAR", motivo: "JANELA_LIVRE_FECHADA" },
  );
});
test("revalidacao detecta nova mensagem mesmo com timestamp identico", () => {
  const a = atendimento(),
    b = atendimento();
  b.ultima!.id = "m3";
  assert.equal(mesmaConversa(a, b), false);
});

function cenario() {
  const a = atendimento();
  let envios = 0,
    registros = 0,
    status = "",
    limite = true;
  let recusa = false;
  let provedorFalha = false,
    registroFalha = false;
  const recibo = {
    id: "e1",
    atendimentoId: a.id,
    regraId: regra.id,
    chave: "chave",
    execucaoId: "rodada",
    texto: regra.texto,
    botoes: config().botoes,
    provedorId: "prov1",
  };
  const controle: ControleFollowup = {
    async recusou() {
      return recusa;
    },
    async envios() {
      return [];
    },
    async reservar() {
      status = "RESERVADO";
      return { id: "e1", chave: "chave" };
    },
    async marcar(_id, novo) {
      status = novo;
    },
    async consumirLimite() {
      return limite;
    },
    async liberarLimite() {},
    async comprovar() {
      status = "ENVIADO";
      return recibo;
    },
    async registrado() {},
    async encerrado() {},
    async pendentes() {
      return [recibo];
    },
  };
  const crm: CrmFollowup = {
    async configuracao() {
      return config();
    },
    async reservar() {
      return { podeEnviar: true, motivo: "" };
    },
    async registrar() {
      registros++;
      if (registroFalha) throw Error("crm");
      return "m2";
    },
    async finalizar() {},
  };
  const consulta = {
    async obter() {
      return a;
    },
    async listar() {
      return [a];
    },
    async ultimoId() {
      return a.id;
    },
  };
  const executar = () =>
    new ProcessarAtendimento(
      consulta,
      controle,
      crm,
      {
        validar() {},
        async enviar() {
          envios++;
          if (provedorFalha) throw Error("timeout");
          return "prov1";
        },
      },
      () => agora,
    );
  return {
    a,
    crm,
    consulta,
    controle,
    executar,
    get envios() {
      return envios;
    },
    get registros() {
      return registros;
    },
    get status() {
      return status;
    },
    recusar() {
      recusa = true;
    },
    esgotar() {
      limite = false;
    },
    falharProvedor() {
      provedorFalha = true;
    },
    falharRegistro() {
      registroFalha = true;
    },
    recuperarCrm() {
      registroFalha = false;
    },
  };
}
test("envia, persiste comprovante e registra no CRM", async () => {
  const s = cenario();
  assert.equal(
    await s.executar().executar(s.a, config(), "rodada"),
    "ENVIADO_E_REGISTRADO",
  );
  assert.equal(s.envios, 1);
  assert.equal(s.status, "ENVIADO");
  assert.equal(s.registros, 1);
});
test("timeout do provedor fica incerto, nao registra sucesso ficticio", async () => {
  const s = cenario();
  s.falharProvedor();
  assert.equal(
    await s.executar().executar(s.a, config(), "rodada"),
    "ENVIO_INCERTO",
  );
  assert.equal(s.status, "INCERTO");
  assert.equal(s.registros, 0);
});
test("aceite seguido de falha CRM recupera apenas registro, sem segundo envio", async () => {
  const s = cenario();
  s.falharRegistro();
  assert.equal(
    await s.executar().executar(s.a, config(), "rodada"),
    "ENVIADO_REGISTRO_CRM_PENDENTE",
  );
  s.recuperarCrm();
  await s.executar().recuperarRegistros();
  assert.equal(s.envios, 1);
  assert.equal(s.registros, 2);
});
test("limite atingido nao cria reserva que bloqueie candidato da proxima rodada", async () => {
  const s = cenario();
  s.esgotar();
  assert.equal(
    await s.executar().executar(s.a, config(), "rodada"),
    "LIMITE_DA_RODADA",
  );
  assert.equal(s.status, "");
  assert.equal(s.envios, 0);
});
test("CRM negou autorizacao: nenhum provedor chamado", async () => {
  const s = cenario();
  s.crm.reservar = async () => ({ podeEnviar: false, motivo: "COOLDOWN" });
  assert.equal(
    await s.executar().executar(s.a, config(), "rodada"),
    "CRM_NEGOU_COOLDOWN",
  );
  assert.equal(s.envios, 0);
  assert.equal(s.status, "ADIADO");
});
test("recusa recebida no n8n entre reserva e envio cancela o envio", async () => {
  const s = cenario();
  s.crm.reservar = async () => {
    s.recusar();
    return { podeEnviar: true, motivo: "" };
  };
  assert.equal(
    await s.executar().executar(s.a, config(), "rodada"),
    "CONVERSA_MUDOU_APOS_RESERVA",
  );
  assert.equal(s.envios, 0);
});
test("erro de configuracao HTTP nao vira regra fallback", async () => {
  const crm = new CrmHttpFollowup(
    "https://crm.invalid",
    "fixture",
    {
      async chamar() {
        throw Error("401");
      },
    },
    { exigeJanela: false },
  );
  await assert.rejects(crm.configuracao());
});
test("HTTP nao repete POST e nao expoe segredos na excecao", async () => {
  let chamadas = 0;
  const http = new HttpJson(100, async () => {
    chamadas++;
    throw Error("segredo-do-provedor");
  });
  await assert.rejects(
    http.chamar("https://provedor.invalid/token/segredo", {}, {}),
    (e) => !String(e).includes("segredo"),
  );
  assert.equal(chamadas, 1);
});
test("allowlist bloqueia destinatario antes de chamar provedor", async () => {
  let chamadas = 0;
  const p = new WhatsAppFollowup(
    {
      tipo: "evolution",
      base: "https://fixture.invalid",
      instancia: "teste",
      token: "fixture",
    },
    {
      async chamar() {
        chamadas++;
        return {};
      },
    },
    { habilitada: true, numeros: [] },
  );
  await assert.rejects(
    p.enviar({
      telefone: "5561999990000",
      texto: "Ola",
      botoes: config().botoes,
    }),
  );
  assert.equal(chamadas, 0);
});
for (const tipo of ["evolution", "z-api", "meta"] as const)
  test(`adaptador ${tipo} produz contrato e exige ID de comprovante`, async () => {
    let corpo: unknown;
    const base = {
      base: "https://fixture.invalid",
      instancia: "instancia",
      numero: "numero",
      token: "fixture",
      clientToken: "fixture",
    };
    const p = new WhatsAppFollowup(
      { ...base, tipo },
      {
        async chamar(_url, _headers, body) {
          corpo = body;
          return tipo === "meta"
            ? { messages: [{ id: "id1" }] }
            : tipo === "evolution"
              ? { key: { id: "id1", fromMe: true } }
              : { messageId: "id1" };
        },
      },
      { habilitada: false, numeros: [] },
    );
    assert.equal(
      await p.enviar({
        telefone: "5561999990000",
        texto: "Ola",
        botoes: config().botoes,
      }),
      "id1",
    );
    assert.ok(corpo);
  });
test("env de follow-up exige conexoes explicitas, nao empresta banco interno n8n", () => {
  assert.throws(() => carregarFollowup({}), /WHATSAPP_PROVEDOR/);
  assert.throws(
    () =>
      carregarFollowup({
        WHATSAPP_PROVEDOR: "evolution",
        EVOLUTION_HABILITADO: "false",
      }),
    /DESLIGADA/,
  );
});

test("perda da coordenacao antes do provedor interrompe sem enviar", async () => {
  const s = cenario();
  const verificar = () => {
    if (s.status === "EM_ENVIO") throw new Error("COORDENACAO_INTERROMPIDA");
  };
  await assert.rejects(
    s.executar().executar(s.a, config(), "rodada", verificar),
  );
  assert.equal(s.envios, 0);
  assert.equal(s.status, "EM_ENVIO", "manter bloqueado para conciliacao");
});

test("meta-cloud reutiliza o nome do provedor configurado no CRM", () => {
  const c = carregarFollowup({
    WHATSAPP_PROVEDOR: "meta-cloud",
    WHATSAPP_NUMERO: "123",
    WHATSAPP_TOKEN: "fixture",
    SYNAPSE_TOKEN_INTERNO: "fixture",
    POSTGRES_DB: "crm_fixture",
    POSTGRES_USER: "fixture",
    POSTGRES_PASSWORD: "fixture",
  });
  assert.equal(c.provedor.tipo, "meta");
  assert.equal(c.regras.exigeJanela, true);
  assert.equal(c.restricao.habilitada, true);
});

for (const tipo of ["evolution", "z-api", "meta"] as const)
  test(`${tipo}: HTTP 200 sem comprovante nao significa envio comprovado`, async () => {
    const p = new WhatsAppFollowup(
      {
        tipo,
        base: "https://fixture.invalid",
        instancia: "teste",
        numero: "123",
        token: "fixture",
        clientToken: "fixture",
      },
      {
        async chamar() {
          return { status: "success" };
        },
      },
      { habilitada: false, numeros: [] },
    );
    await assert.rejects(
      p.enviar({
        telefone: "5561999990000",
        texto: "Ola",
        botoes: config().botoes,
      }),
    );
  });
