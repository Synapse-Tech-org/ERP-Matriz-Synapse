-- Estrutura declarada pelo EV-06 atual, incluindo encerramento do ciclo.
CREATE TABLE public.follow_ups_temporary (
    id bigserial PRIMARY KEY,
    follow_up_config_id text NOT NULL,
    clinica_id integer NOT NULL DEFAULT 1,
    paciente_id text,
    lead_id text,
    titulo text NOT NULL DEFAULT 'Follow-up de atendimento',
    descricao text,
    scheduled_at timestamptz NOT NULL DEFAULT now(),
    crm_atendimento_id text NOT NULL,
    crm_paciente_id text,
    regra_followup_nome text,
    lead_ultima_mensagem_em timestamptz,
    lead_ultima_mensagem_chave text NOT NULL DEFAULT 'SEM_RESPOSTA_LEAD',
    ultima_mensagem_base_em timestamptz,
    mensagem_enviada text,
    whatsapp_message_id text,
    crm_mensagem_id text,
    status text NOT NULL DEFAULT 'ENVIADO',
    enviado_em timestamptz,
    encerrado_em timestamptz,
    motivo_encerramento text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX follow_ups_temporary_ev_idempotencia_idx
    ON public.follow_ups_temporary
    (crm_atendimento_id, follow_up_config_id, lead_ultima_mensagem_chave);
CREATE INDEX follow_ups_temporary_ev_atendimento_idx
    ON public.follow_ups_temporary (crm_atendimento_id, enviado_em DESC);
