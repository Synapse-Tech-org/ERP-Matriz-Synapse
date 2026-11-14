#!/usr/bin/env bash
set -euo pipefail

# Executa somente containers efemeros no runner/local. Nao chama Dokploy ou Swarm.
imagem="${AUTOMACAO_IMAGEM_TESTE:-synapse-automacao-ci}"
container=""
trap 'if [ -n "$container" ]; then docker rm -f "$container" >/dev/null; fi' EXIT

container="$(docker run --detach --network none --read-only --cap-drop ALL --security-opt no-new-privileges "$imagem")"
for tentativa in $(seq 1 30); do
  estado="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
  if [ "$estado" = healthy ]; then break; fi
  if [ "$estado" = unhealthy ] || [ "$(docker inspect --format '{{.State.Running}}' "$container")" != true ]; then
    docker logs "$container"
    exit 1
  fi
  sleep 1
done
test "$estado" = healthy

docker exec "$container" node --input-type=module -e '
  import assert from "node:assert/strict";
  import { existsSync } from "node:fs";
  assert.notEqual(process.getuid(), 0);
  assert.equal(existsSync(".env"), false);
  assert.equal(existsSync("node_modules/typescript"), false);
  assert.equal(existsSync("node_modules/tsx"), false);
  assert.equal(existsSync("dist/test"), false);
  const health = await fetch("http://127.0.0.1:3100/health/liveness");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: "UP",
    capacidades: { automacaoHabilitada: false, followUpHabilitado: false },
  });
  const ready = await fetch("http://127.0.0.1:3100/health/readiness");
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: "UP" });
'

# Parada normal precisa terminar por SIGTERM, nao por SIGKILL ao expirar o prazo.
docker stop --time 10 "$container" >/dev/null
test "$(docker inspect --format '{{.State.ExitCode}}' "$container")" = 0
docker rm "$container" >/dev/null
container=""

# O bloqueio geral vence a chave especifica mesmo no runtime empacotado.
docker run --rm --network none \
  -e AUTOMACAO_HABILITADA=false -e AUTOMACAO_FOLLOWUP_HABILITADO=true \
  "$imagem" node --input-type=module -e '
    import assert from "node:assert/strict";
    import { carregarConfiguracao } from "./dist/src/config.js";
    assert.equal(carregarConfiguracao(process.env).followUpHabilitado, false);
  '

# Exigir o erro esperado: falha do Docker ou timeout nao contam como validacao.
container="$(docker run --detach --network none -e AUTOMACAO_HABILITADA=sim "$imagem")"
test "$(timeout 10s docker wait "$container")" = 1
docker logs "$container" 2>&1 | grep -F 'AUTOMACAO_HABILITADA deve ser true ou false'
docker rm "$container" >/dev/null
container=""
echo 'automacao: boot sem dependencias, healthchecks, usuario nao-root, toggles e SIGTERM validados'
