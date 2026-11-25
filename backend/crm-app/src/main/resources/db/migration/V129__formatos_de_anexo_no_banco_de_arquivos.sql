ALTER TABLE arquivo_banco
    DROP CONSTRAINT arquivo_banco_arquivo_validado,
    ADD CONSTRAINT arquivo_banco_arquivo_validado CHECK (
        mime_type IS NULL OR (
            pasta IS NOT NULL AND pasta IN ('catalogos','tabelas','contratos','projetos','orcamentos','fotos')
            AND tamanho_bytes IS NOT NULL AND tamanho_bytes > 0
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
