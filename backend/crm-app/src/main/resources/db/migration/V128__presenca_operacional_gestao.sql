-- Ajuste operacional temporário, independente do status gravado pelo CRM.
ALTER TABLE usuario
    ADD COLUMN presenca_gestao text,
    ADD COLUMN presenca_gestao_ate timestamptz,
    ADD CONSTRAINT usuario_presenca_gestao_valida CHECK (
        (presenca_gestao IS NULL AND presenca_gestao_ate IS NULL)
        OR (presenca_gestao IS NOT NULL AND presenca_gestao IN ('ONLINE', 'OFFLINE', 'PAUSA')
            AND presenca_gestao_ate IS NOT NULL)
    );

CREATE TABLE presenca_gestao_historico (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id uuid NOT NULL REFERENCES usuario(id),
    autor_id uuid NOT NULL REFERENCES usuario(id),
    estado_anterior text NOT NULL CHECK (estado_anterior IN ('ONLINE', 'OFFLINE', 'AUSENTE', 'PAUSA')),
    estado_novo text NOT NULL CHECK (estado_novo IN ('ONLINE', 'OFFLINE', 'PAUSA')),
    registrado_em timestamptz NOT NULL,
    valido_ate timestamptz NOT NULL CHECK (valido_ate > registrado_em)
);

CREATE INDEX idx_presenca_gestao_historico_usuario ON presenca_gestao_historico (usuario_id, registrado_em DESC);
CREATE INDEX idx_presenca_gestao_historico_autor ON presenca_gestao_historico (autor_id);

-- A view da V107 identifica ambas as FKs. Novas tabelas operacionais precisam do guard da V107 explicitamente.
CREATE TRIGGER impedir_vinculo_conta_teste
    BEFORE INSERT OR UPDATE OF usuario_id, autor_id ON presenca_gestao_historico
    FOR EACH ROW EXECUTE FUNCTION app_impedir_vinculo_conta_teste('usuario_id', 'autor_id');
