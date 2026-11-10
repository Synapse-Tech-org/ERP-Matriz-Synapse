-- Memoria da aplicacao, nao historico de execucoes do produto n8n.
CREATE TABLE public.n8n_chat_histories (
    id serial PRIMARY KEY,
    session_id varchar(255) NOT NULL,
    message jsonb NOT NULL,
    created_at timestamptz NULL DEFAULT now()
);
