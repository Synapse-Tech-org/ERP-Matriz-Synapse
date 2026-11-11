import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import arquivos from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import type { ConfiguracaoAutomacao } from "../config.js";
import {
  FalhaIdentidade,
  type ProvedorIdentidade,
  type UsuarioPainel,
} from "./identidade.js";
import { SessoesPainel } from "./sessoes.js";
import {
  registrarConsultasOperacao,
  type DependenciasOperacao,
} from "./rotas.js";

declare module "fastify" {
  interface FastifyRequest {
    usuarioPainel?: UsuarioPainel;
  }
}
export interface ConfiguracaoPainel {
  identidade?: ProvedorIdentidade | undefined;
  raizArquivos?: string | undefined;
  cookieSeguro: boolean;
}

export function registrarPainel(
  app: FastifyInstance,
  config: ConfiguracaoAutomacao,
  deps: DependenciasOperacao,
  painel: ConfiguracaoPainel,
): void {
  const sessoes = painel.identidade
    ? new SessoesPainel(painel.identidade)
    : undefined;
  app.register(cookie);
  app.register(rateLimit, { global: false });
  app.addHook("onClose", async () => {
    sessoes?.limpar();
  });
  app.get("/", async (_req, reply) => reply.redirect("/painel/"));
  if (painel.raizArquivos && existsSync(painel.raizArquivos))
    app.register(arquivos, {
      root: painel.raizArquivos,
      prefix: "/painel/",
      index: ["index.html"],
      setHeaders(res) {
        res.header("X-Content-Type-Options", "nosniff");
        res.header(
          "Content-Security-Policy",
          "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        );
      },
    });
  app.register(
    async (scope) => {
      scope.addHook("onRequest", async (req, reply) => {
        reply.header("Cache-Control", "no-store");
        if (req.method !== "GET") {
          const origem = req.headers.origin;
          if (origem) {
            try {
              if (new URL(origem).host !== req.headers.host)
                return reply.code(403).send({ codigo: "ORIGEM_INVALIDA" });
            } catch {
              return reply.code(403).send({ codigo: "ORIGEM_INVALIDA" });
            }
          }
        }
        if (req.method === "POST" && req.routeOptions.url?.endsWith("/sessao"))
          return;
        if (!sessoes)
          return reply.code(503).send({ codigo: "CRM_NAO_CONFIGURADO" });
        try {
          req.usuarioPainel = await sessoes.consultar(
            req.cookies.synapse_automacao,
          );
        } catch (error) {
          const falha =
            error instanceof FalhaIdentidade
              ? error
              : new FalhaIdentidade("CRM_INDISPONIVEL", 503);
          return reply.code(falha.status).send({ codigo: falha.codigo });
        }
      });
      scope.post<{ Body: { email: string; senha: string } }>(
        "/sessao",
        {
          bodyLimit: 4096,
          config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
          schema: {
            body: {
              type: "object",
              additionalProperties: false,
              required: ["email", "senha"],
              properties: {
                email: { type: "string", minLength: 3, maxLength: 254 },
                senha: { type: "string", minLength: 1, maxLength: 1024 },
              },
            },
          },
        },
        async (req, reply) => {
          if (!sessoes)
            return reply.code(503).send({ codigo: "CRM_NAO_CONFIGURADO" });
          try {
            const login = await sessoes.entrar(req.body.email, req.body.senha);
            reply.setCookie("synapse_automacao", login.id, {
              path: "/painel",
              httpOnly: true,
              secure: painel.cookieSeguro,
              sameSite: "strict",
              maxAge: login.validadeSegundos,
            });
            return { usuario: login.usuario };
          } catch (error) {
            const falha =
              error instanceof FalhaIdentidade
                ? error
                : new FalhaIdentidade("CRM_INDISPONIVEL", 503);
            return reply.code(falha.status).send({ codigo: falha.codigo });
          }
        },
      );
      scope.get("/sessao", async (req) => ({ usuario: req.usuarioPainel }));
      scope.post("/sair", async (req, reply) => {
        sessoes?.sair(req.cookies.synapse_automacao);
        reply.clearCookie("synapse_automacao", { path: "/painel" });
        return { encerrada: true };
      });
      registrarConsultasOperacao(scope, config, deps);
    },
    { prefix: "/painel/api" },
  );
}
