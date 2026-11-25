INSERT INTO configuracao_automacao (chave, valor, tipo, descricao)
VALUES
    ('fidelizacao.excluir_finalizados', 'true', 'BOOLEAN',
     'Exclui atendimentos finalizados da fidelização.'),
    ('sistematicas.somente_horario_comercial', 'false', 'BOOLEAN',
     'Restringe mensagens sistemáticas ao expediente da instância.'),
    ('sistematicas.expediente', '[]', 'TEXT',
     'Intervalos semanais em JSON, com dia de 0 a 6 e horários inicio e fim em HH:mm.'),
    ('sistematicas.meta.template_nome', '', 'TEXT',
     'Nome do template aprovado na conta Meta da instância.'),
    ('sistematicas.meta.template_idioma', '', 'TEXT',
     'Código de idioma aprovado para o template Meta.'),
    ('sistematicas.meta.parametro_texto', '', 'TEXT',
     'Nome do parâmetro do corpo que recebe o texto no template Meta.')
ON CONFLICT (chave) DO NOTHING;
