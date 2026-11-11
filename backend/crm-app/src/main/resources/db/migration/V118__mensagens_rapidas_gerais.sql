ALTER TABLE mensagem_rapida
    ADD COLUMN geral boolean NOT NULL DEFAULT false;

DROP INDEX idx_msg_rapida_atendente_chave;

CREATE UNIQUE INDEX idx_msg_rapida_atendente_chave
    ON mensagem_rapida (atendente_id, lower(palavra_chave)) WHERE NOT geral;

CREATE UNIQUE INDEX idx_msg_rapida_geral_chave
    ON mensagem_rapida (lower(palavra_chave)) WHERE geral;
