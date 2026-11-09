#!/bin/sh
set -eu
umask 077
temporario=$(mktemp -d)
concluido=false
finalizar() {
  codigo=$?
  rm -rf -- "$temporario"
  if [ "$codigo" -ne 0 ] || [ "$concluido" != true ]; then printf 'false\n'; fi
}
trap finalizar EXIT
export PGUSER="$AUTOMACAO_DB_USER" PGPASSWORD="$AUTOMACAO_DB_PASSWORD" PGDATABASE="$AUTOMACAO_DB_NAME" PGCONNECT_TIMEOUT=5
psql -X -qAt --set ON_ERROR_STOP=1 --command 'SELECT 1' >/dev/null
marcador=$(psql -X -qAt --set ON_ERROR_STOP=1 --command "SELECT to_regclass('automacao_infra.provisionamento') IS NOT NULL")
if [ "$marcador" = t ]; then
  origem=$(psql -X -qAt --set ON_ERROR_STOP=1 --command 'SELECT banco_origem FROM automacao_infra.provisionamento WHERE id = 1 AND versao = 1')
  [ "$origem" = "$N8N_DB_NAME" ] || { printf '%s\n' 'Marcador do destino nao corresponde a origem configurada' >&2; exit 1; }
  printf '%s\n' 'Banco ja provisionado; estrutura e registros preservados' >&2
  concluido=true; printf 'true\n'; exit 0
fi
# Sem marcador, nunca restaurar em um banco populado ou de outra aplicacao.
objetos=$(psql -X -qAt --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')")
[ "$objetos" = 0 ] || { printf '%s\n' 'Destino sem marcador contem objetos; nenhum objeto foi apagado' >&2; exit 1; }
# So estrutura: nao copia registros de credenciais, usuarios ou execucoes.
PGUSER="$N8N_DB_USER" PGPASSWORD="$N8N_DB_PASSWORD" PGDATABASE="$N8N_DB_NAME" \
  pg_dump --format=custom --schema-only --no-owner --no-privileges --file "$temporario/estrutura.dump"
pg_restore --schema-only --no-owner --no-privileges --clean --if-exists \
  --file "$temporario/estrutura.sql" "$temporario/estrutura.dump"
# O destino foi verificado vazio. Restore e marcador sao uma unica transacao.
psql -X -q --single-transaction --set ON_ERROR_STOP=1 --set origem="$N8N_DB_NAME" \
  --file "$temporario/estrutura.sql" --file /opt/automacao/marcador.sql >&2
printf '%s\n' 'Estrutura n8n clonada sem dados' >&2
concluido=true
printf 'true\n'
