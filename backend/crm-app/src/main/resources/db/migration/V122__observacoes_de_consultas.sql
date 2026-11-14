INSERT INTO feature_flag (chave, habilitado, descricao)
VALUES ('variante_clinica', false, 'Habilita os recursos específicos para clínicas.')
ON CONFLICT (chave) DO NOTHING;

ALTER TABLE configuracao_automacao ADD CONSTRAINT ck_clinica_observacoes
CHECK (CASE WHEN chave = 'clinica.observacoes_consultas' THEN
    jsonb_typeof(valor::jsonb) = 'array'
    AND octet_length(valor) <= 512000
    AND NOT jsonb_path_exists(valor::jsonb, '$[50]')
    AND NOT jsonb_path_exists(valor::jsonb,
        '$[*] ? (@.type() != "object" || !(exists(@.id) && exists(@.tipo) && exists(@.observacao)) || @.id.type() != "string" || @.tipo.type() != "string" || @.observacao.type() != "string")')
ELSE TRUE END);

INSERT INTO configuracao_automacao (chave, valor, unidade, tipo, valor_min, valor_max, descricao)
VALUES ('clinica.observacoes_consultas', '[]', NULL, 'TEXT', NULL, NULL,
        'Tipos de consulta e orientações cadastradas pela equipe clínica.')
ON CONFLICT (chave) DO NOTHING;
