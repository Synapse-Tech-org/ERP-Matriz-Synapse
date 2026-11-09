import assert from "node:assert/strict";
import test from "node:test";
import { stringify } from "flatted";
import { criarAplicacao } from "../src/app.js";
import { carregarConfiguracao } from "../src/config.js";
import { carregarBanco } from "../src/operacao/configuracao.js";
import { lerEtapas } from "../src/operacao/etapas.js";
import {
  autorizarPainel,
  FalhaIdentidade,
  type ProvedorIdentidade,
} from "../src/operacao/identidade.js";
import { SessoesPainel } from "../src/operacao/sessoes.js";
import { aplicarMigracoes } from "../src/operacao/migracoes.js";
import type { Pool } from "pg";
import type { RepositorioExecucoes } from "../src/operacao/contratos.js";

const usuario = { id: "gestor-teste", nome: "Gestor", papel: "GESTOR" };
const permissoes = () => ({
  usuarioId: usuario.id,
  capacidades: {
    "automacao.ver": { permitido: true },
    "clientes.acessar": { permitido: true },
    "atendimentos.ver": { permitido: true, alcance: "TODOS" },
  },
});
const identidade: ProvedorIdentidade = {
  async autenticar() {
    return { token: "token-que-nao-pode-sair", validadeSegundos: 60, usuario };
  },
  async validar() {
    return usuario;
  },
};

test("migracoes registram checksum, nao reaplicam e recusam historico alterado", async () => {
  let checksum: string | undefined;
  let aplicacoes = 0;
  let rollbacks = 0;
  let liberacoes = 0;
  const client = {
    async query(sql: string, valores?: unknown[]) {
      if (sql.startsWith("SELECT checksum"))
        return { rows: checksum ? [{ checksum }] : [] };
      if (sql.startsWith("INSERT INTO automacao_infra.migracao")) {
        checksum = String(valores![2]);
        aplicacoes++;
      }
      if (sql === "ROLLBACK") rollbacks++;
      return { rows: [] };
    },
    release() {
      liberacoes++;
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  await aplicarMigracoes(pool);
  await aplicarMigracoes(pool);
  assert.equal(aplicacoes, 1);
  checksum = "checksum-adulterado";
  await assert.rejects(
    aplicarMigracoes(pool),
    /MIGRATION_APLICADA_FOI_ALTERADA/,
  );
  assert.equal(rollbacks, 1);
  assert.equal(liberacoes, 3);
});
function repositorio(): RepositorioExecucoes {
  return {
    estado: () => "PRONTO",
    async preparar() {},
    async fechar() {},
    async resumo() {
      return { total: 0, sucesso: 0, falhas: 0, emExecucao: 0 };
    },
    async listar(filtro) {
      return { itens: [], total: 0, ...filtro };
    },
    async detalhar() {
      return null;
    },
  };
}

test("banco opcional, configuracao parcial recusada e pool limitado", () => {
  assert.equal(carregarBanco({}), undefined);
  assert.throws(() => carregarBanco({ AUTOMACAO_DB_NAME: "automacao" }));
  const env = {
    AUTOMACAO_DB_NAME: "automacao",
    AUTOMACAO_DB_USER: "app",
    AUTOMACAO_DB_PASSWORD: "teste",
  };
  assert.equal(carregarBanco(env)?.max, 3);
  assert.throws(() => carregarBanco({ ...env, POSTGRES_DB: "automacao" }));
  assert.throws(() => carregarBanco({ ...env, N8N_DB_NAME: "automacao" }));
  assert.throws(() => carregarBanco({ ...env, AUTOMACAO_DB_NAME: "postgres" }));
  assert.throws(() =>
    carregarBanco({ ...env, AUTOMACAO_DB_SCHEMA: "public; drop" }),
  );
  assert.throws(() => carregarBanco({ ...env, AUTOMACAO_DB_POOL_MAX: "11" }));
});

for (const serializar of [JSON.stringify, stringify]) {
  test(`etapas aceitam ${serializar === stringify ? "flatted" : "JSON"} sem expor payloads`, () => {
    const dado = {
      resultData: {
        runData: {
          Enviar: [
            { executionTime: 12, data: { senha: "SEGREDO" } },
            { executionTime: 3, error: { message: "SEGREDO" } },
          ],
        },
      },
    };
    const resultado = lerEtapas(serializar(dado));
    assert.deepEqual(resultado, [
      { nome: "Enviar", status: "erro", duracaoMs: 15, tentativas: 2 },
    ]);
    assert.ok(!JSON.stringify(resultado).includes("SEGREDO"));
  });
}
test("payload invalido ou sem runData nao inventa etapas", () => {
  assert.equal(lerEtapas("invalido"), undefined);
  assert.equal(lerEtapas("{}"), undefined);
});

test("permissoes do CRM e identidade precisam coincidir", () => {
  assert.deepEqual(autorizarPainel(usuario, permissoes()), usuario);
  assert.throws(
    () => autorizarPainel({ ...usuario, papel: "ATENDENTE" }, permissoes()),
    FalhaIdentidade,
  );
  assert.throws(
    () => autorizarPainel(usuario, { ...permissoes(), usuarioId: "outro" }),
    FalhaIdentidade,
  );
  const parcial = permissoes();
  parcial.capacidades["atendimentos.ver"].alcance = "PROPRIOS";
  assert.throws(() => autorizarPainel(usuario, parcial), FalhaIdentidade);
  assert.throws(
    () => autorizarPainel(usuario, { usuarioId: usuario.id, capacidades: {} }),
    FalhaIdentidade,
  );
});

test("sessao expira, revalida permissoes e nunca devolve JWT", async () => {
  let agora = 0;
  let validacoes = 0;
  const sessoes = new SessoesPainel(
    {
      ...identidade,
      async validar() {
        validacoes++;
        return usuario;
      },
    },
    () => agora,
  );
  const login = await sessoes.entrar("teste@exemplo.com", "senha");
  assert.ok(!JSON.stringify(login).includes("token-que-nao-pode-sair"));
  assert.deepEqual(await sessoes.consultar(login.id), usuario);
  agora = 31000;
  await sessoes.consultar(login.id);
  assert.equal(validacoes, 1);
  agora = 61000;
  await assert.rejects(sessoes.consultar(login.id), FalhaIdentidade);
  const nova = await sessoes.entrar("teste@exemplo.com", "senha");
  sessoes.sair(nova.id);
  await assert.rejects(sessoes.consultar(nova.id), FalhaIdentidade);
});

test("API privada exige token, valida filtros e nao inventa execucoes", async () => {
  const app = criarAplicacao(carregarConfiguracao({}), {
    token: "privado",
    repositorio: repositorio(),
  });
  const headers = { "x-automacao-token": "privado" };
  try {
    assert.equal(
      (await app.inject("/internal/v1/operacao/status")).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({ url: "/internal/v1/operacao/status", headers })
      ).json().executorDisponivel,
      false,
    );
    assert.equal(
      (
        await app.inject({
          url: "/internal/v1/operacao/execucoes?tamanho=501",
          headers,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          url: "/internal/v1/operacao/execucoes?status=erro%27",
          headers,
        })
      ).statusCode,
      400,
    );
    const lista = await app.inject({
      url: "/internal/v1/operacao/execucoes",
      headers,
    });
    assert.deepEqual(lista.json(), {
      itens: [],
      total: 0,
      pagina: 0,
      tamanho: 20,
    });
    assert.equal(
      (
        await app.inject({
          url: "/internal/v1/operacao/execucoes/inexistente",
          headers,
        })
      ).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});

test("painel independente autentica via CRM e protege consultas por cookie", async () => {
  const app = criarAplicacao(
    carregarConfiguracao({}),
    { repositorio: repositorio() },
    { identidade, cookieSeguro: true },
  );
  try {
    assert.equal((await app.inject("/painel/api/status")).statusCode, 401);
    const login = await app.inject({
      method: "POST",
      url: "/painel/api/sessao",
      payload: { email: "teste@exemplo.com", senha: "teste" },
    });
    assert.equal(login.statusCode, 200);
    assert.ok(!login.body.includes("token-que-nao-pode-sair"));
    const cookie = String(login.headers["set-cookie"]);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    const headers = { cookie: cookie.split(";")[0]! };
    assert.equal(
      (await app.inject({ url: "/painel/api/status", headers })).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/painel/api/sair",
          headers: { ...headers, origin: "https://outro.local" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ method: "POST", url: "/painel/api/sair", headers }))
        .statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ url: "/painel/api/status", headers })).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});

test("banco ausente e indisponivel aparecem como tal, sem derrubar liveness", async () => {
  const repo = repositorio();
  repo.estado = () => "BANCO_INDISPONIVEL";
  for (const banco of [undefined, repo]) {
    const app = criarAplicacao(carregarConfiguracao({}), {
      token: "teste",
      repositorio: banco,
    });
    try {
      assert.equal((await app.inject("/health/liveness")).statusCode, 200);
      assert.equal(
        (await app.inject("/health/readiness")).statusCode,
        banco ? 503 : 200,
      );
      const r = await app.inject({
        url: "/internal/v1/operacao/status",
        headers: { "x-automacao-token": "teste" },
      });
      assert.equal(r.json().resumo, null);
      assert.equal(
        r.json().estado,
        banco ? "BANCO_INDISPONIVEL" : "BANCO_NAO_CONFIGURADO",
      );
    } finally {
      await app.close();
    }
  }
});
