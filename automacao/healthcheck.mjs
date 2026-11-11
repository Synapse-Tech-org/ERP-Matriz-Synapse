import { carregarConfiguracao } from './dist/src/config.js';

const { port } = carregarConfiguracao(process.env);
try {
  const resposta = await fetch(`http://127.0.0.1:${port}/health/liveness`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!resposta.ok) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
