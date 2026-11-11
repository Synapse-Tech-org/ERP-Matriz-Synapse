# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS build
COPY automacao/package.json automacao/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY automacao/tsconfig.json automacao/tsconfig.build.json ./
COPY automacao/src ./src
COPY automacao/painel ./painel
RUN npm run build

FROM base AS dependencies
COPY automacao/package.json automacao/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM base AS runtime
ENV NODE_ENV=production \
    AUTOMACAO_HOST=0.0.0.0 \
    AUTOMACAO_PORT=3100 \
    AUTOMACAO_HABILITADA=false \
    AUTOMACAO_FOLLOWUP_HABILITADO=false

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist/src ./dist/src
COPY --from=build --chown=node:node /app/painel-dist ./painel-dist
COPY --chown=node:node automacao/healthcheck.mjs ./healthcheck.mjs
COPY --chown=node:node automacao/banco/migrations ./banco/migrations

USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "healthcheck.mjs"]
CMD ["node", "dist/src/server.js"]
