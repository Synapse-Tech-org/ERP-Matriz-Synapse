CREATE TABLE public.ev05_solicitacoes_automacao (
    solicitacao_id uuid PRIMARY KEY,
    lead_id uuid NOT NULL,
    atendimento_id uuid NOT NULL,
    execucao_id text NOT NULL,
    estado text NOT NULL DEFAULT 'PENDENTE',
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);
