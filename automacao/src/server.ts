import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { criarAplicacao } from './app.js';
import { carregarConfiguracao } from './config.js';

const arquivoEnv = resolve(process.cwd(), '.env');
if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const configuracao = carregarConfiguracao(process.env);
const app = criarAplicacao(configuracao);

// O Docker envia SIGTERM no redeploy. Fechar o Fastify drena requisicoes em curso.
for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sinal, () => {
    app.close().catch((error: unknown) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: configuracao.host, port: configuracao.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
