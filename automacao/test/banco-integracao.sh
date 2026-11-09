#!/usr/bin/env bash
# Teste local isolado: nao usa infraestrutura ou segredos da homologacao.
set -euo pipefail
raiz=$(cd "$(dirname "$0")/.." && pwd)
container="automacao-banco-teste-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$container" --network none \
  -e POSTGRES_PASSWORD=senha_admin_de_teste -e POSTGRES_DB=crm_fixture \
  -v "$raiz/banco:/opt/automacao:ro" postgres:15-alpine >/dev/null
pronto=false
for tentativa in $(seq 1 60); do
  if docker exec "$container" pg_isready -U postgres -d crm_fixture >/dev/null 2>&1; then pronto=true; break; fi
  sleep 1
done
[ "$pronto" = true ] || { echo 'PostgreSQL de teste nao iniciou' >&2; exit 1; }
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d crm_fixture <<'SQL'
CREATE ROLE n8n_fixture LOGIN PASSWORD 'senha_origem_de_teste';
CREATE DATABASE n8n_fixture OWNER n8n_fixture TEMPLATE template0;
\connect n8n_fixture n8n_fixture
CREATE TABLE workflow_entity (id varchar PRIMARY KEY, name varchar NOT NULL);
CREATE TABLE execution_entity (id bigserial PRIMARY KEY, "workflowId" varchar REFERENCES workflow_entity(id), status varchar NOT NULL, "startedAt" timestamptz, "stoppedAt" timestamptz);
CREATE TABLE execution_data ("executionId" bigint PRIMARY KEY REFERENCES execution_entity(id), data text);
CREATE TABLE credentials_entity (id varchar PRIMARY KEY, data text);
INSERT INTO workflow_entity VALUES ('fluxo_teste', 'Fixture');
INSERT INTO execution_entity ("workflowId",status) VALUES ('fluxo_teste','success');
INSERT INTO credentials_entity VALUES ('credencial_teste','NAO_COPIAR');
SQL
provisionar() {
  docker exec \
    -e AUTOMACAO_DB_HOST=127.0.0.1 -e AUTOMACAO_DB_PORT=5432 \
    -e AUTOMACAO_DB_NAME="${1:-automacao_fixture}" -e AUTOMACAO_DB_USER=automacao_fixture_app \
    -e AUTOMACAO_DB_PASSWORD=senha_destino_de_teste \
    -e POSTGRES_DB=crm_fixture -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=senha_admin_de_teste \
    -e N8N_DB_NAME=n8n_fixture -e N8N_DB_USER=n8n_fixture -e N8N_DB_PASSWORD=senha_origem_de_teste \
    "$container" sh /opt/automacao/provisionar.sh
}
consulta() { docker exec "$container" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d "$1" -c "$2"; }
provisionar
[ "$(consulta automacao_fixture "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('workflow_entity','execution_entity','execution_data','credentials_entity')")" = 4 ]
[ "$(consulta automacao_fixture 'SELECT count(*) FROM credentials_entity')" = 0 ]
[ "$(consulta automacao_fixture 'SELECT count(*) FROM execution_entity')" = 0 ]
[ "$(consulta n8n_fixture 'SELECT count(*) FROM credentials_entity')" = 1 ]
consulta automacao_fixture "INSERT INTO workflow_entity VALUES ('preservar','Nao apagar')" >/dev/null
provisionar
[ "$(consulta automacao_fixture 'SELECT count(*) FROM workflow_entity')" = 1 ]
consulta postgres 'CREATE DATABASE destino_ocupado OWNER automacao_fixture_app' >/dev/null
consulta destino_ocupado 'CREATE TABLE nao_apagar (id integer)' >/dev/null
if provisionar destino_ocupado; then echo 'ERRO: aceitou destino ocupado' >&2; exit 1; fi
[ "$(consulta destino_ocupado "SELECT to_regclass('public.nao_apagar') IS NOT NULL")" = t ]
echo 'OK: clone sem dados, origem preservada, redeploy idempotente e destino ocupado protegido'
