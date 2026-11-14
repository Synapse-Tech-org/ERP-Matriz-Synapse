CREATE SCHEMA automacao_infra;
CREATE TABLE automacao_infra.provisionamento (
    id smallint PRIMARY KEY CHECK (id = 1),
    versao integer NOT NULL,
    banco_origem text NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO automacao_infra.provisionamento (id, versao, banco_origem) VALUES (1, 1, :'origem');
COMMENT ON SCHEMA automacao_infra IS 'Metadados da automacao TypeScript; nao e runtime n8n';
