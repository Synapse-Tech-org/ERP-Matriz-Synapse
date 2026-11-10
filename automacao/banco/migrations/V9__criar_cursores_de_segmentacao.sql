CREATE TABLE public.ev17_cursores (
    chave text PRIMARY KEY,
    ultimo_atendimento_id text NOT NULL DEFAULT '',
    atualizado_em timestamptz NOT NULL DEFAULT now()
);
