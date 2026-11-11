import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ConfiguracaoAutomacao } from "../config.js";
import type { FiltroExecucoes, RepositorioExecucoes } from "./contratos.js";

export interface DependenciasOperacao {
  readonly repositorio?: RepositorioExecucoes | undefined;
  readonly token?: string | undefined;
  readonly executorDisponivel?: () => boolean;
}

export function registrarOperacao(
  app: FastifyInstance,
  config: ConfiguracaoAutomacao,
  deps: DependenciasOperacao,
): void {
  app.register(
    async (scope) => {
      scope.addHook("onRequest", async (req, reply) => {
        if (!deps.token)
          return reply.code(503).send({ codigo: "OPERACAO_NAO_CONFIGURADA" });
        const header = req.headers["x-automacao-token"];
        const supplied =
          typeof header === "string" ? Buffer.from(header) : Buffer.alloc(0);
        const expected = Buffer.from(deps.token);
        if (
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        )
          return reply.code(401).send({ codigo: "NAO_AUTORIZADO" });
      });
      registrarConsultasOperacao(scope, config, deps);
    },
    { prefix: "/internal/v1/operacao" },
  );
}

export function registrarConsultasOperacao(
  scope: FastifyInstance,
  config: ConfiguracaoAutomacao,
  deps: DependenciasOperacao,
): void {
  scope.get("/status", async (_req, reply) => {
    const estado = deps.repositorio?.estado() || "BANCO_NAO_CONFIGURADO";
    try {
      return {
        estado,
        automacaoHabilitada: config.automacaoHabilitada,
        followUpHabilitado: config.followUpHabilitado,
        executorDisponivel: deps.executorDisponivel?.() === true,
        resumo: estado === "PRONTO" ? await deps.repositorio!.resumo() : null,
      };
    } catch {
      return reply.code(503).send({ codigo: "BANCO_INDISPONIVEL" });
    }
  });
  scope.get<{ Querystring: FiltroExecucoes }>(
    "/execucoes",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            pagina: {
              type: "integer",
              minimum: 0,
              maximum: 100000,
              default: 0,
            },
            tamanho: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            status: { type: "string", pattern: "^[a-z_]{1,32}$" },
          },
        },
      },
    },
    async (req, reply) => {
      if (deps.repositorio?.estado() !== "PRONTO")
        return reply.code(503).send({ codigo: "BANCO_NAO_PRONTO" });
      try {
        return await deps.repositorio.listar(req.query);
      } catch {
        return reply.code(503).send({ codigo: "BANCO_INDISPONIVEL" });
      }
    },
  );
  scope.get<{ Params: { id: string } }>(
    "/execucoes/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
          },
        },
      },
    },
    async (req, reply) => {
      if (deps.repositorio?.estado() !== "PRONTO")
        return reply.code(503).send({ codigo: "BANCO_NAO_PRONTO" });
      try {
        const item = await deps.repositorio.detalhar(req.params.id);
        return (
          item || reply.code(404).send({ codigo: "EXECUCAO_NAO_ENCONTRADA" })
        );
      } catch {
        return reply.code(503).send({ codigo: "BANCO_INDISPONIVEL" });
      }
    },
  );
}
