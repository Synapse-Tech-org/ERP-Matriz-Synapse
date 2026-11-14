ALTER TABLE feedback_usuario
    ADD COLUMN anexo_nome text,
    ADD COLUMN anexo_tipo text,
    ADD COLUMN anexo_conteudo bytea,
    ADD CONSTRAINT feedback_anexo_completo CHECK (
        num_nonnulls(anexo_nome, anexo_tipo, anexo_conteudo) = 0 OR (
            num_nonnulls(anexo_nome, anexo_tipo, anexo_conteudo) = 3
            AND char_length(anexo_nome) BETWEEN 1 AND 200
            AND anexo_tipo IN ('image/png', 'image/jpeg')
            AND octet_length(anexo_conteudo) BETWEEN 1 AND 5242880
        )
    );
