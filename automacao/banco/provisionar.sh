#!/bin/sh
set -eu
umask 077
erro() { printf '%s\n' "AUTOMACAO_PROVISIONAMENTO: $1" >&2; exit 1; }
for nome in AUTOMACAO_DB_NAME AUTOMACAO_DB_USER AUTOMACAO_DB_PASSWORD POSTGRES_USER POSTGRES_PASSWORD N8N_DB_NAME N8N_DB_USER N8N_DB_PASSWORD POSTGRES_DB; do
  eval 'valor=${'"$nome"':-}'
  [ -n "$valor" ] || erro "$nome ausente; nenhum banco foi alterado"
done
for nome in AUTOMACAO_DB_NAME AUTOMACAO_DB_USER; do
  eval 'valor=${'"$nome"'}'
  case "$valor" in *[!a-z0-9_]*|[0-9]*|'') erro "$nome deve conter letras minusculas, numeros e underscore, sem iniciar por numero";; esac
  [ "${#valor}" -le 63 ] || erro "$nome excede 63 caracteres"
done
[ "$AUTOMACAO_DB_NAME" != "$POSTGRES_DB" ] || erro 'destino nao pode ser o banco CRM'
[ "$AUTOMACAO_DB_NAME" != "$N8N_DB_NAME" ] || erro 'destino nao pode ser o banco n8n'
case "$AUTOMACAO_DB_NAME" in postgres|template0|template1) erro 'destino administrativo proibido';; esac
[ "$AUTOMACAO_DB_USER" != "$POSTGRES_USER" ] || erro 'usuario deve ser exclusivo da automacao'
[ "$AUTOMACAO_DB_USER" != "$N8N_DB_USER" ] || erro 'usuario nao pode ser o usuario n8n'
export PGHOST="${AUTOMACAO_DB_HOST:-postgres}" PGPORT="${AUTOMACAO_DB_PORT:-5432}"
export PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE=postgres PGCONNECT_TIMEOUT=5
tentativa=0
until pg_isready -q -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres; do
  tentativa=$((tentativa + 1)); [ "$tentativa" -lt 60 ] || erro 'PostgreSQL indisponivel'
  sleep 2
done
# Esta sessao mantem o lock enquanto o script filho executa o clone.
exec psql -X --set ON_ERROR_STOP=1 --set automacao_db="$AUTOMACAO_DB_NAME" \
  --set automacao_user="$AUTOMACAO_DB_USER" --set automacao_password="$AUTOMACAO_DB_PASSWORD" \
  --file /opt/automacao/provisionar.sql
