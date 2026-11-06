import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const executar = promisify(execFile);
const cwd = fileURLToPath(new URL('../', import.meta.url));
const envBase = {
  ...process.env,
  AUTOMACAO_HOST: '127.0.0.1',
  AUTOMACAO_HABILITADA: 'false',
  AUTOMACAO_FOLLOWUP_HABILITADO: 'true',
};

async function reservarPorta() {
  const servidor = createServer();
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  return servidor;
}

test('processo compilado inicia HTTP, executa healthcheck e encerra', { timeout: 15000 }, async (t) => {
  const reserva = await reservarPorta();
  const port = reserva.address().port;
  await new Promise((resolve) => reserva.close(resolve));
  const env = { ...envBase, AUTOMACAO_PORT: String(port) };
  const filho = spawn(process.execPath, ['dist/src/server.js'], { cwd, env });
  const encerrado = once(filho, 'exit');
  let log = '';
  filho.stderr.on('data', (chunk) => { log += chunk; });
  t.after(async () => {
    if (filho.exitCode === null && filho.signalCode === null) filho.kill('SIGTERM');
    await encerrado;
  });

  // Esperar o log real de escuta evita sleeps e requisicoes antes do boot.
  await new Promise((resolve, reject) => {
    filho.once('error', reject);
    filho.once('exit', () => reject(new Error(`Processo encerrou antes do boot: ${log}`)));
    filho.stdout.on('data', (chunk) => {
      log += chunk;
      if (log.includes('Server listening at')) resolve();
    });
  });
  const health = await fetch(`http://127.0.0.1:${port}/health/liveness`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: 'UP',
    capacidades: { automacaoHabilitada: false, followUpHabilitado: false },
  });
  const ready = await fetch(`http://127.0.0.1:${port}/health/readiness`);
  assert.equal(ready.status, 200);
  await executar(process.execPath, ['healthcheck.mjs'], { cwd, env, timeout: 5000 });
  filho.kill('SIGTERM');
  const [code] = await encerrado;
  // No Windows, kill termina o processo; no Linux exercita o handler SIGTERM.
  if (process.platform !== 'win32') assert.equal(code, 0, log);
});

test('processo compilado rejeita toggle invalido antes de abrir HTTP', async () => {
  await assert.rejects(
    executar(process.execPath, ['dist/src/server.js'], {
      cwd,
      env: { ...envBase, AUTOMACAO_HABILITADA: 'sim' },
      timeout: 5000,
    }),
    (erro) => erro.code === 1 && erro.stderr.includes('AUTOMACAO_HABILITADA deve ser true ou false'),
  );
});

test('falha de bind encerra o processo sem ficar pendurado', async (t) => {
  const reserva = await reservarPorta();
  t.after(() => new Promise((resolve) => reserva.close(resolve)));
  await assert.rejects(
    executar(process.execPath, ['dist/src/server.js'], {
      cwd,
      env: { ...envBase, AUTOMACAO_PORT: String(reserva.address().port) },
      timeout: 5000,
    }),
    (erro) => erro.code === 1 && erro.stdout.includes('EADDRINUSE'),
  );
});
