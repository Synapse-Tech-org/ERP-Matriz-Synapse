ALTER TABLE lembrete
    ADD COLUMN excluido_em TIMESTAMPTZ,
    ADD COLUMN excluido_por UUID,
    ADD COLUMN chave_exclusao UUID,
    ADD CONSTRAINT ck_lembrete_exclusao_com_autor
        CHECK ((excluido_em IS NULL) = (excluido_por IS NULL)
               AND (excluido_em IS NULL) = (chave_exclusao IS NULL));
