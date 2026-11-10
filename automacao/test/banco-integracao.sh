#!/usr/bin/env bash
# Teste local isolado: nao usa infraestrutura ou segredos da homologacao.
set -euo pipefail
raiz=$(cd "$(dirname "$0")/.." && pwd)
if [ ! -f "$raiz/dist/src/operacao/migracoes.js" ] || [ ! -d "$raiz/node_modules/pg" ]; then
  echo 'Executar npm ci e npm run build na pasta automacao antes deste teste' >&2
  exit 1
fi
container="automacao-banco-teste-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$container" --network none \
  -e POSTGRES_PASSWORD=senha_admin_de_teste -e POSTGRES_DB=crm_fixture \
  -v "$raiz/banco:/opt/automacao:ro" postgres:15-alpine >/dev/null
pronto=false
for tentativa in $(seq 1 60); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d crm_fixture >/dev/null 2>&1; then pronto=true; break; fi
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
CREATE TYPE fixture_enum AS ENUM ('um', 'dois');
CREATE INDEX fixture_status_idx ON execution_entity(status);
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
[ "$(consulta automacao_fixture 'SELECT count(*) FROM public.faq')" = 0 ]
[ "$(consulta automacao_fixture 'SELECT count(*) FROM automacao_infra.migracao')" = 9 ]
[ "$(consulta n8n_fixture 'SELECT count(*) FROM credentials_entity')" = 1 ]
[ "$(consulta automacao_fixture "SELECT count(*) FROM pg_type WHERE typname='fixture_enum'")" = 1 ]
[ "$(consulta automacao_fixture "SELECT to_regclass('public.fixture_status_idx') IS NOT NULL")" = t ]
consulta automacao_fixture "INSERT INTO workflow_entity VALUES ('preservar','Nao apagar')" >/dev/null
provisionar
[ "$(consulta automacao_fixture 'SELECT count(*) FROM workflow_entity')" = 1 ]

# Node usa o mesmo namespace de rede do PostgreSQL isolado, sem expor portas.
# Somente codigo/dependencias sao montados; nenhum .env entra no container.
docker run --rm --network "container:$container" \
  -e AUTOMACAO_TESTE_ISOLADO=true \
  -v "$raiz/dist:/app/dist:ro" \
  -v "$raiz/node_modules:/app/node_modules:ro" \
  -v "$raiz/package.json:/app/package.json:ro" \
  -v "$raiz/banco/migrations:/app/banco/migrations:ro" \
  -v "$raiz/test/faq-integracao.mjs:/app/test/faq-integracao.mjs:ro" \
  -v "$raiz/test/auxiliares-integracao.mjs:/app/test/auxiliares-integracao.mjs:ro" \
  -w /app node:22-alpine node test/faq-integracao.mjs
provisionar
[ "$(consulta automacao_fixture 'SELECT count(*) FROM public.faq')" = 1 ]

# Simula o banco de homologacao com V1/V2 e FAQ ja cadastrada.
# O preparador atualizado deve aplicar V3-V9 sem reclonar nem perder registros.
consulta postgres 'CREATE DATABASE legado_fixture OWNER automacao_fixture_app' >/dev/null
consulta legado_fixture "SET ROLE automacao_fixture_app;
CREATE SCHEMA automacao_infra;
CREATE TABLE automacao_infra.provisionamento (id smallint PRIMARY KEY, versao integer, banco_origem text);
INSERT INTO automacao_infra.provisionamento VALUES (1,1,'n8n_fixture');
CREATE TABLE preservar (id integer PRIMARY KEY);
INSERT INTO preservar VALUES (1)" >/dev/null
checksum_v1=$(sha256sum "$raiz/banco/migrations/V1__registrar_base_de_execucoes.sql"); checksum_v1=${checksum_v1%% *}
checksum_v2=$(sha256sum "$raiz/banco/migrations/V2__criar_faq_institucional.sql"); checksum_v2=${checksum_v2%% *}
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d legado_fixture \
  -c 'SET ROLE automacao_fixture_app' \
  -f /opt/automacao/migrations/V1__registrar_base_de_execucoes.sql \
  -f /opt/automacao/migrations/V2__criar_faq_institucional.sql \
  -c "CREATE TABLE automacao_infra.migracao (versao integer PRIMARY KEY, arquivo text NOT NULL, checksum text NOT NULL, aplicado_em timestamptz NOT NULL DEFAULT now());
INSERT INTO automacao_infra.migracao (versao,arquivo,checksum) VALUES
(1,'V1__registrar_base_de_execucoes.sql','$checksum_v1'),
(2,'V2__criar_faq_institucional.sql','$checksum_v2');
INSERT INTO public.faq (nome,pergunta,resposta) VALUES ('legado','Preservar?','Sim')" >/dev/null
provisionar legado_fixture
[ "$(consulta legado_fixture 'SELECT count(*) FROM public.faq')" = 1 ]
[ "$(consulta legado_fixture 'SELECT count(*) FROM public.n8n_chat_histories')" = 0 ]
[ "$(consulta legado_fixture 'SELECT count(*) FROM automacao_infra.migracao')" = 9 ]
[ "$(consulta legado_fixture 'SELECT count(*) FROM preservar')" = 1 ]
consulta legado_fixture "UPDATE automacao_infra.migracao SET checksum='adulterado' WHERE versao=1" >/dev/null
if provisionar legado_fixture; then echo 'ERRO: aceitou checksum alterado' >&2; exit 1; fi
[ "$(consulta legado_fixture 'SELECT count(*) FROM preservar')" = 1 ]

consulta postgres 'CREATE DATABASE destino_ocupado OWNER automacao_fixture_app' >/dev/null
consulta destino_ocupado 'CREATE TABLE nao_apagar (id integer)' >/dev/null
if provisionar destino_ocupado; then echo 'ERRO: aceitou destino ocupado' >&2; exit 1; fi
[ "$(consulta destino_ocupado "SELECT to_regclass('public.nao_apagar') IS NOT NULL")" = t ]

# A origem de TESTE ganha um schema que conflita com nosso marcador, forcando
# falha depois do restore. Tudo no destino deve voltar ao estado vazio.
consulta n8n_fixture 'CREATE SCHEMA automacao_infra AUTHORIZATION n8n_fixture' >/dev/null
if provisionar destino_falha; then echo 'ERRO: aceitou conflito de schema' >&2; exit 1; fi
[ "$(consulta destino_falha "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")" = 0 ]
[ "$(consulta destino_falha "SELECT to_regclass('automacao_infra.provisionamento') IS NULL")" = t ]
consulta n8n_fixture 'DROP SCHEMA automacao_infra' >/dev/null
provisionar destino_falha
[ "$(consulta destino_falha 'SELECT count(*) FROM automacao_infra.provisionamento')" = 1 ]

# Duas tarefas disputam o mesmo destino, como pode ocorrer num redeploy.
provisionar corrida_fixture & primeiro=$!
provisionar corrida_fixture & segundo=$!
wait "$primeiro"
wait "$segundo"
[ "$(consulta corrida_fixture 'SELECT count(*) FROM automacao_infra.provisionamento')" = 1 ]

for proibido in crm_fixture n8n_fixture postgres; do
  if provisionar "$proibido"; then echo 'ERRO: aceitou banco protegido' >&2; exit 1; fi
done
[ "$(consulta n8n_fixture 'SELECT count(*) FROM credentials_entity')" = 1 ]
echo 'OK: schema sem dados, origem preservada, repeticao, rollback, concorrencia e destinos protegidos'
