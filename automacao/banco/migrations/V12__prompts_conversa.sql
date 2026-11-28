CREATE TABLE automacao_infra.prompt_conversa (
  chave text PRIMARY KEY,
  valor text NOT NULL CHECK (length(trim(valor)) BETWEEN 1 AND 32000),
  atualizado_por text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
