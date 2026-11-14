-- Estrutura usada pelos fluxos da Estrutural. Dados devem ser definidos por filho.
-- O executor registra esta versao uma vez; nao recriar nem apagar dados existentes.
CREATE TABLE public.faq (
    id serial PRIMARY KEY,
    nome text NOT NULL,
    pergunta text NOT NULL,
    resposta text NOT NULL
);

CREATE UNIQUE INDEX faq_nome_idx ON public.faq (nome);
