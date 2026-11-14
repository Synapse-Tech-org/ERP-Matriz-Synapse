CREATE TABLE public.ev17_segmentacoes (
    atendimento_id uuid NOT NULL,
    mensagem_ia_id uuid NOT NULL,
    mensagem_ia_em timestamptz NOT NULL,
    lead_id uuid NOT NULL,
    execucao_id text NOT NULL,
    estado text NOT NULL DEFAULT 'RESERVADO',
    etapa_id uuid,
    chave_crm text,
    modelo text,
    confianca double precision,
    http_status integer,
    input_tokens integer,
    output_tokens integer,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (atendimento_id, mensagem_ia_id, mensagem_ia_em)
);
CREATE INDEX ev17_segmentacoes_execucao_idx
    ON public.ev17_segmentacoes (execucao_id);
