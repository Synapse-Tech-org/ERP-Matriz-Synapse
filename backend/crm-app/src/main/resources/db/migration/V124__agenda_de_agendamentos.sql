CREATE TABLE agendamento (
    id UUID PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES lead(id),
    inicio TIMESTAMPTZ NOT NULL,
    profissional VARCHAR(160) NOT NULL CHECK (btrim(profissional) <> ''),
    tipo VARCHAR(160) NOT NULL CHECK (btrim(tipo) <> ''),
    cobertura VARCHAR(160),
    estado VARCHAR(20) NOT NULL CHECK (estado IN
        ('AGENDADO', 'CONFIRMADO', 'CHEGOU', 'EM_ATENDIMENTO', 'ATENDIDO', 'FALTOU', 'CANCELADO')),
    revisao BIGINT NOT NULL DEFAULT 0
);

-- A agenda reserva um horário de início por profissional, inclusive com gravações concorrentes.
CREATE UNIQUE INDEX agendamento_horario_ocupado ON agendamento (lower(profissional), inicio)
    WHERE estado <> 'CANCELADO';
CREATE INDEX agendamento_inicio_idx ON agendamento (inicio, id);
CREATE INDEX agendamento_lead_idx ON agendamento (lead_id);

ALTER TABLE agendamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento FORCE ROW LEVEL SECURITY;
CREATE POLICY agendamento_visivel ON agendamento
    FOR ALL USING (
        app_papel() IN ('GESTOR', 'SUBGESTOR', 'ADMINISTRADOR', 'ATENDENTE', 'OPERADOR')
        AND EXISTS (SELECT 1 FROM lead WHERE lead.id = agendamento.lead_id)
    ) WITH CHECK (
        app_papel() IN ('GESTOR', 'SUBGESTOR', 'ADMINISTRADOR', 'ATENDENTE', 'OPERADOR')
        AND EXISTS (SELECT 1 FROM lead WHERE lead.id = agendamento.lead_id)
    );
REVOKE DELETE ON agendamento FROM synapse_app;
