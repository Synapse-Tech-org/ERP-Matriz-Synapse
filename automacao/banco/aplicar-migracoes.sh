#!/bin/sh
set -eu
umask 077

# Chamado pelo preparador, depois do clone, usando apenas o usuario da automacao.
# O mesmo historico/checksum e usado pelo executor TypeScript. Nao toca no CRM.
export PGUSER="$AUTOMACAO_DB_USER" PGPASSWORD="$AUTOMACAO_DB_PASSWORD"
export PGDATABASE="$AUTOMACAO_DB_NAME" PGCONNECT_TIMEOUT=5
diretorio=/opt/automacao/migrations
temporario=$(mktemp -d)
trap 'rm -rf -- "$temporario"' EXIT
manifesto="$temporario/manifesto"
: > "$manifesto"
for arquivo in "$diretorio"/V*__*.sql; do
  [ -f "$arquivo" ] || { echo 'Nenhuma migracao da automacao montada' >&2; exit 1; }
  nome=${arquivo##*/}
  # So aceita os mesmos nomes simples usados pelo executor TypeScript.
  printf '%s\n' "$nome" | grep -Eq '^V[0-9]+__[a-z0-9_]+\.sql$' || exit 1
  versao=${nome%%__*}; versao=${versao#V}
  printf '%s %s\n' "$versao" "$nome" >> "$manifesto"
done
sort -n -k1,1 "$manifesto" > "$temporario/ordenado"
awk '{v=$1+0; if (v in vistos) exit 1; vistos[v]=1}' "$temporario/ordenado" || {
  echo 'Versao de migracao duplicada' >&2; exit 1;
}

# Um unico psql mantem o lock e a transacao ate todas as versoes terminarem.
# Qualquer erro desfaz historico e DDL juntos; reaplicar preserva os dados.
sql="$temporario/aplicar.sql"
cat > "$sql" <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtextextended('synapse:automacao:migrations',0));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM automacao_infra.provisionamento WHERE id=1 AND versao=1) THEN
    RAISE EXCEPTION 'Marcador de provisionamento ausente ou incompativel';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS automacao_infra.migracao (
  versao integer PRIMARY KEY, arquivo text NOT NULL, checksum text NOT NULL,
  aplicado_em timestamptz NOT NULL DEFAULT now()
);
SQL
while read -r versao nome; do
  checksum=$(sha256sum "$diretorio/$nome"); checksum=${checksum%% *}
  cat >> "$sql" <<SQL
SELECT EXISTS (SELECT 1 FROM automacao_infra.migracao WHERE versao=$versao) AS aplicada
\gset
\if :aplicada
  SELECT checksum = '$checksum' AS checksum_correto FROM automacao_infra.migracao WHERE versao=$versao
  \gset
  \if :checksum_correto
  \else
    DO \$\$ BEGIN RAISE EXCEPTION 'MIGRATION_APLICADA_FOI_ALTERADA: $nome'; END \$\$;
  \endif
\else
  \i $diretorio/$nome
  INSERT INTO automacao_infra.migracao (versao,arquivo,checksum) VALUES ($versao,'$nome','$checksum');
\endif
SQL
done < "$temporario/ordenado"
printf '%s\n' 'COMMIT;' >> "$sql"
psql -X --set ON_ERROR_STOP=1 --file "$sql" >&2
echo 'Migracoes da automacao aplicadas e verificadas' >&2
