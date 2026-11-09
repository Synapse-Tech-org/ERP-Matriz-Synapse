import Fastify from "fastify";
import type { ConfiguracaoAutomacao } from "./config.js";
import {
  registrarOperacao,
  type DependenciasOperacao,
} from "./operacao/rotas.js";
import { registrarPainel, type ConfiguracaoPainel } from "./operacao/painel.js";

export function criarAplicacao(
  configuracao: ConfiguracaoAutomacao,
  operacao: DependenciasOperacao = {},
  painel?: ConfiguracaoPainel,
) {
  const app = Fastify({ logger: true });

  app.get("/health/liveness", async () => ({
    status: "UP",
    capacidades: {
      automacaoHabilitada: configuracao.automacaoHabilitada,
      followUpHabilitado: configuracao.followUpHabilitado,
    },
  }));

  app.get("/health/readiness", async (_req, reply) => {
    if (operacao.repositorio && operacao.repositorio.estado() !== "PRONTO") {
      return reply
        .code(503)
        .send({ status: "DOWN", codigo: "BANCO_AUTOMACAO_NAO_PRONTO" });
    }
    return { status: "UP" };
  });

  registrarOperacao(app, configuracao, operacao);
  if (painel) registrarPainel(app, configuracao, operacao, painel);

  return app;
}
