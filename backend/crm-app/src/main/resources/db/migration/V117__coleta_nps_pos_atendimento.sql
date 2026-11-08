ALTER TABLE avaliacao
    ADD COLUMN nota_recomendacao SMALLINT CHECK (nota_recomendacao BETWEEN 0 AND 10);

-- A automação decide se apresenta a pergunta adicional. A coleta nasce desligada.
INSERT INTO configuracao_automacao (chave, valor, unidade, tipo, valor_min, valor_max, descricao)
VALUES
    ('avaliacao_atendimento.nps_habilitado', 'false', NULL, 'BOOLEAN', NULL, NULL,
     'Inclui a pergunta de recomendação na pesquisa pós-atendimento executada pela automação.'),
    ('avaliacao_atendimento.nps_pergunta',
     'De 0 a 10, qual a probabilidade de você recomendar nossa empresa a um amigo ou colega?',
     NULL, 'TEXT', NULL, NULL, 'Pergunta de recomendação para a pesquisa NPS.')
ON CONFLICT (chave) DO NOTHING;
