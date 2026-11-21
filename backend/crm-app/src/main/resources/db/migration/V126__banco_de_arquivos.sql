INSERT INTO feature_flag (chave, habilitado, descricao)
VALUES ('banco_arquivos', false, 'Biblioteca privada de arquivos do CRM.')
ON CONFLICT (chave) DO NOTHING;

-- Linhas antigas, sem validação de formato, continuam preservadas e não são publicadas.
ALTER TABLE arquivo_banco
    ADD COLUMN pasta VARCHAR(20),
    ADD COLUMN mime_type VARCHAR(100),
    ADD COLUMN exclusao_expira_em TIMESTAMPTZ,
    ADD CONSTRAINT arquivo_banco_arquivo_validado CHECK (
        mime_type IS NULL OR (
            pasta IS NOT NULL AND pasta IN ('catalogos','tabelas','contratos','projetos','orcamentos','fotos')
            AND tamanho_bytes IS NOT NULL AND tamanho_bytes > 0
            AND (tipo, mime_type) IN (
                ('PDF', 'application/pdf'),
                ('DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
                ('XLSX', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                ('DWG', 'image/vnd.dwg'),
                ('IMAGEM', 'image/jpeg'),
                ('IMAGEM', 'image/png')
            )
        )
    );

CREATE INDEX idx_arquivo_banco_ativos ON arquivo_banco (criado_em DESC, id)
    WHERE mime_type IS NOT NULL AND exclusao_expira_em IS NULL;

CREATE INDEX idx_arquivo_banco_expirados ON arquivo_banco (exclusao_expira_em, id)
    WHERE mime_type IS NOT NULL AND exclusao_expira_em IS NOT NULL;
