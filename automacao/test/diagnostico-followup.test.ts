import assert from "node:assert/strict";
import test from "node:test";
import { motivoSeguro } from "../src/operacao/diagnostico-followup.js";
import { explicarResultado } from "../painel/src/diagnostico.js";
import { RepositorioExecucoesPostgres } from "../src/operacao/postgres.js";

test("motivo publico preserva codigo conhecido, nao resposta ou token", () => {
  assert.equal(motivoSeguro(null), null);
  assert.equal(motivoSeguro("REGISTRO_CRM_PENDENTE"), "REGISTRO_CRM_PENDENTE");
  assert.equal(motivoSeguro("REGISTRO_CRM_PENDENTE_HTTP_401"), "REGISTRO_CRM_PENDENTE_HTTP_401");
  assert.equal(motivoSeguro("REGISTRO_CRM_PENDENTE_POSTGRES_42P01"), "REGISTRO_CRM_PENDENTE_POSTGRES_42P01");
  for (const bruto of ["segredo", "https://api.invalid/token/segredo", "REGISTRO_CRM_PENDENTE_HTTP_400 segredo"]) {
    assert.ok(!String(motivoSeguro(bruto)).includes("segredo"));
  }
});

test("descricao distingue aceite, pendencia CRM e ausencia de envio", () => {
  assert.match(explicarResultado("ENVIADO_E_REGISTRADO"), /Entrega e leitura ainda nao comprovadas/);
  assert.match(explicarResultado("ENVIADO_REGISTRO_CRM_PENDENTE"), /nao reenviar/);
  assert.match(explicarResultado("JANELA_LIVRE_FECHADA"), /Sem envio/);
  assert.match(explicarResultado("FALHA_HTTP_401"), /autenticacao/);
});

test("detalhe limita registros e relaciona comprovante por atendimento e rodada", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const repo = new RepositorioExecucoesPostgres({
    host: "fixture.invalid", port: 5432, database: "fixture", user: "fixture",
    password: "fixture", schema: "public", max: 1,
  });
  const consultas: string[] = [];
  // Substituir o pool nao abre conexao: este teste verifica o contrato de leitura.
  Object.assign(repo, {
    atual: "PRONTO",
    pool: {
      async query(sql: string) {
        consultas.push(sql);
        if (sql.includes("LATERAL")) return { rows: [{
          atendimento_id: id, resultado: "ENVIADO_REGISTRO_CRM_PENDENTE",
          duracao_ms: 20, total: 201, comprovante_id: "13", status_envio: "ENVIADO",
          whatsapp_message_id: "wamid.fixture", crm_mensagem_id: null,
          motivo_operacional: "REGISTRO_CRM_PENDENTE_HTTP_400",
          enviado_em: new Date("2026-11-17T11:07:00Z"),
        }] };
        if (sql.includes("GROUP BY")) return { rows: [{ resultado: "ENVIADO_REGISTRO_CRM_PENDENTE", quantidade: 1, duracao: 20 }] };
        return { rows: [{ id, status: "error", iniciado_em: new Date(),
          finalizado_em: new Date(), padroes_utilizados: [], motivo: null }] };
      },
      async end() {},
    },
  });
  const detalhe = await repo.detalhar("fu_" + id);
  assert.equal(detalhe?.totalAtendimentos, 201);
  assert.equal(detalhe?.atendimentos?.[0]?.provedorId, "wamid.fixture");
  assert.equal(detalhe?.atendimentos?.[0]?.crmMensagemId, null);
  assert.equal(detalhe?.atendimentos?.[0]?.motivo, "REGISTRO_CRM_PENDENTE_HTTP_400");
  const sql = consultas.find((s) => s.includes("LATERAL"))!;
  assert.match(sql, /LIMIT 200/);
  assert.match(sql, /execucao_id=\$1::text AND crm_atendimento_id=e.atendimento_id::text/);
  assert.ok(!sql.includes("mensagem_enviada"));
  await repo.fechar();
});
