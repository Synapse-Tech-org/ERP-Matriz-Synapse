-- Nomes da origem preservados para compatibilidade com os fluxos existentes.
CREATE TABLE public.ev07_envios_automaticos (
    id bigserial PRIMARY KEY,
    categoria text NOT NULL,
    referencia_id text NOT NULL,
    lead_id text NOT NULL,
    ciclo_chave text NOT NULL,
    telefone text NOT NULL,
    texto_enviado text NOT NULL,
    payload_meta jsonb NOT NULL,
    status text NOT NULL DEFAULT 'RESERVADO',
    execucao_n8n_id text,
    meta_message_id text,
    reservado_em timestamptz NOT NULL DEFAULT now(),
    enviado_em timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ev07_envios_automaticos_idempotencia_idx
    ON public.ev07_envios_automaticos
    (categoria, referencia_id, lead_id, ciclo_chave);
CREATE INDEX ev07_envios_automaticos_status_idx
    ON public.ev07_envios_automaticos (status, updated_at);
