import test from "node:test";
import assert from "node:assert/strict";
import { codigoFalha, motivoInterrupcao } from "../src/followup/falhas.js";
import { FalhaIntegracao } from "../src/followup/http.js";
import { ExecutarRodada } from "../src/followup/rodada.js";
import type { Pool } from "pg";
import type {
  ConsultaAtendimentos,
  CrmFollowup,
} from "../src/followup/contratos.js";
import type { ProcessarAtendimento } from "../src/followup/processar-atendimento.js";

test("painel distingue HTTP 401, 404 e timeout sem gravar URL ou token", () => {
  assert.equal(codigoFalha(new FalhaIntegracao("HTTP_401")), "HTTP_401");
  assert.equal(codigoFalha(new FalhaIntegracao("HTTP_404")), "HTTP_404");
  assert.equal(
    codigoFalha(new FalhaIntegracao("CONEXAO_OU_RESPOSTA_INVALIDA")),
    "CONEXAO_OU_RESPOSTA_INVALIDA",
  );
});
test("erro PostgreSQL expoe somente SQLSTATE, nao detalhe sensivel", () => {
  const error = Object.assign(new Error("senha ou dado privado"), {
    code: "42P01",
  });
  assert.equal(codigoFalha(error), "POSTGRES_42P01");
});
test("contrato e parametro invalidos nao perdem sua classificacao", () => {
  assert.equal(
    codigoFalha(new Error("CONTRATO_CONFIGURACAO_CRM_INVALIDO")),
    "CONTRATO_CONFIGURACAO_CRM_INVALIDO",
  );
  assert.equal(
    codigoFalha(new Error("PARAMETRO_CRM_INVALIDO: valor-privado")),
    "PARAMETRO_CRM_INVALIDO",
  );
});
test("mensagem desconhecida nunca vira detalhe publico", () => {
  for (const error of [
    new Error("https://url/token/privado"),
    "segredo",
    { code: "TOKEN_PRIVADO" },
    new FalhaIntegracao("TOKEN_PRIVADO"),
  ])
    assert.equal(codigoFalha(error), "CAUSA_NAO_CLASSIFICADA");
});

test("validacao do provedor preserva a causa sem expor destinatario ou mensagem", () => {
  for (const codigo of [
    "TELEFONE_INVALIDO",
    "NUMERO_NAO_PERMITIDO",
    "TEXTO_INTERATIVO_INVALIDO",
    "BOTOES_INVALIDOS",
    "EVOLUTION_SEM_COMPROVANTE_DE_SAIDA",
    "COMPROVANTE_META_AUSENTE",
  ])
    assert.equal(codigoFalha(new Error(codigo)), codigo);
});
test("motivo preserva fase e causa sem depender da mensagem bruta", () => {
  assert.equal(
    motivoInterrupcao(
      "BUSCAR_CONFIGURACAO_CRM",
      new FalhaIntegracao("HTTP_401"),
    ),
    "RODADA_INTERROMPIDA_BUSCAR_CONFIGURACAO_CRM_HTTP_401",
  );
});

for (const falhaNaConfiguracao of [true, false])
  test(`rodada salva causa na fase ${falhaNaConfiguracao ? "CRM HTTP" : "consulta SQL"} e nao chama envio`, async () => {
    const gravados: unknown[][] = [];
    let candidatosProcessados = 0;
    const pool = {
      async connect() {
        return {
          on() {},
          removeListener() {},
          release() {},
          async query() {
            return { rows: [{ ok: true }] };
          },
        };
      },
      async query(sql: string, valores: unknown[]) {
        if (sql.includes("motivo=$2")) gravados.push(valores);
        return { rows: [] };
      },
    } as unknown as Pool;
    const consulta = {
      async ultimoId() {
        return "00000000-0000-4000-8000-000000000001";
      },
      async listar() {
        throw Object.assign(new Error("detalhe privado"), { code: "42P01" });
      },
      async obter() {
        return null;
      },
    } as ConsultaAtendimentos;
    const crm = {
      async configuracao() {
        if (falhaNaConfiguracao) throw new FalhaIntegracao("HTTP_401");
        return { padroesUtilizados: [] };
      },
    } as unknown as CrmFollowup;
    const processador = {
      async recuperarRegistros() {
        return 0;
      },
      async executar() {
        candidatosProcessados++;
      },
    } as unknown as ProcessarAtendimento;
    const rodada = new ExecutarRodada(
      pool,
      consulta,
      crm,
      processador,
      { intervaloMinutos: 2, pagina: 100, retencaoDias: 90 },
      () => false,
    );
    const motivo = falhaNaConfiguracao
      ? "RODADA_INTERROMPIDA_BUSCAR_CONFIGURACAO_CRM_HTTP_401"
      : "RODADA_INTERROMPIDA_BUSCAR_ATENDIMENTOS_CRM_POSTGRES_42P01";
    await assert.rejects(
      rodada.executar("00000000-0000-4000-8000-000000000002"),
      { message: motivo },
    );
    assert.equal(gravados[0]?.[1], motivo);
    assert.equal(candidatosProcessados, 0);
  });
