CREATE TABLE public.follow_up_opt_outs (
    lead_id text PRIMARY KEY,
    wa_id text,
    atendimento_id text,
    recusado_em timestamptz NOT NULL DEFAULT now(),
    origem text NOT NULL DEFAULT 'BOTAO_NAO',
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX follow_up_opt_outs_wa_idx ON public.follow_up_opt_outs (wa_id);
