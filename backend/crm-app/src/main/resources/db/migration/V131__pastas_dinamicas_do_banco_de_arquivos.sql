CREATE TABLE pasta_arquivo_banco (
    id VARCHAR(36) PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    geral BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT pasta_arquivo_banco_nome_valido CHECK (nome <> '' AND nome = btrim(nome)),
    CONSTRAINT pasta_arquivo_banco_identidade_valida CHECK (
        (geral AND id = 'geral' AND nome = 'Geral') OR
        (NOT geral AND lower(nome) <> 'geral'
            AND id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    )
);

CREATE UNIQUE INDEX uq_pasta_arquivo_banco_nome ON pasta_arquivo_banco (lower(nome));

INSERT INTO pasta_arquivo_banco (id, nome, geral) VALUES ('geral', 'Geral', TRUE);

CREATE FUNCTION proteger_pasta_geral_banco_arquivos() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'pasta_arquivo_banco_geral_permanente',
        MESSAGE = 'A pasta Geral do Banco de Arquivos é permanente.';
END
$$;

CREATE TRIGGER pasta_arquivo_banco_geral_permanente
BEFORE UPDATE OR DELETE ON pasta_arquivo_banco
FOR EACH ROW WHEN (OLD.geral) EXECUTE FUNCTION proteger_pasta_geral_banco_arquivos();

REVOKE DELETE ON pasta_arquivo_banco FROM synapse_app;

ALTER TABLE arquivo_banco
    DROP CONSTRAINT arquivo_banco_arquivo_validado,
    ALTER COLUMN pasta TYPE VARCHAR(36);

-- Mantém o mesmo registro, referência de storage e janela de restauração para cada arquivo.
UPDATE arquivo_banco SET pasta = 'geral' WHERE pasta IS DISTINCT FROM 'geral';

ALTER TABLE arquivo_banco
    ALTER COLUMN pasta SET DEFAULT 'geral',
    ALTER COLUMN pasta SET NOT NULL,
    ADD CONSTRAINT arquivo_banco_pasta_fk FOREIGN KEY (pasta) REFERENCES pasta_arquivo_banco (id),
    ADD CONSTRAINT arquivo_banco_arquivo_validado CHECK (
        mime_type IS NULL OR (
            tamanho_bytes IS NOT NULL AND tamanho_bytes > 0
            AND (tipo, mime_type) IN (
                ('PDF', 'application/pdf'),
                ('DOC', 'application/msword'),
                ('DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
                ('XLS', 'application/vnd.ms-excel'),
                ('XLSX', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                ('PPT', 'application/vnd.ms-powerpoint'),
                ('PPTX', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
                ('TXT', 'text/plain'),
                ('DWG', 'image/vnd.dwg'),
                ('IMAGEM', 'image/jpeg'),
                ('IMAGEM', 'image/png'),
                ('IMAGEM', 'image/webp'),
                ('AUDIO', 'audio/ogg'),
                ('AUDIO', 'audio/mpeg'),
                ('AUDIO', 'audio/mp4'),
                ('AUDIO', 'audio/amr'),
                ('AUDIO', 'audio/aac'),
                ('VIDEO', 'video/mp4'),
                ('VIDEO', 'video/3gpp')
            )
        )
    );

CREATE INDEX idx_arquivo_banco_pasta ON arquivo_banco (pasta);
