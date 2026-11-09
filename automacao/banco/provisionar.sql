\set ON_ERROR_STOP on
SET lock_timeout = '30s';
SELECT pg_advisory_lock(hashtextextended('synapse:automacao:provisionar:' || :'automacao_db', 0));
SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'automacao_user', :'automacao_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'automacao_user')
\gexec
SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS usuario_seguro
FROM pg_roles WHERE rolname = :'automacao_user'
\gset
\if :usuario_seguro
\else
  DO $$ BEGIN RAISE EXCEPTION 'Usuario destino existente tem privilegios administrativos; operacao recusada'; END $$;
\endif
SELECT format('CREATE DATABASE %I WITH OWNER %I TEMPLATE template0', :'automacao_db', :'automacao_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'automacao_db')
\gexec
SELECT pg_get_userbyid(datdba) = :'automacao_user' AS dono_correto
FROM pg_database WHERE datname = :'automacao_db'
\gset
\if :dono_correto
\else
  DO $$ BEGIN RAISE EXCEPTION 'Banco destino pertence a outro usuario; operacao recusada'; END $$;
\endif
-- Apenas true significa clone completo; logs do filho vao para stderr.
\set clone_ok `sh /opt/automacao/clonar-estrutura.sh`
\if :clone_ok
  SELECT pg_advisory_unlock(hashtextextended('synapse:automacao:provisionar:' || :'automacao_db', 0));
\else
  DO $$ BEGIN RAISE EXCEPTION 'Clone da automacao nao foi concluido; consulte os logs anteriores'; END $$;
\endif
