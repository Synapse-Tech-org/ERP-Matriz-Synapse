INSERT INTO configuracao_automacao (chave, valor, unidade, tipo, valor_min, valor_max, descricao)
VALUES ('clinica.regua_consultas', '{"inicio":"08:00","fim":"18:00","antecedencia":24,"confirmacao":"","lembrete":"","reengajamento":""}',
        NULL, 'TEXT', NULL, NULL, 'Horários e mensagens de confirmação e lembretes de consulta.')
ON CONFLICT (chave) DO NOTHING;

ALTER TABLE configuracao_automacao ADD CONSTRAINT ck_clinica_regua_consultas
CHECK (CASE WHEN chave = 'clinica.regua_consultas' THEN
    jsonb_typeof(valor::jsonb) = 'object'
    AND valor::jsonb ?& ARRAY['inicio','fim','antecedencia','confirmacao','lembrete','reengajamento']
    AND valor::jsonb->>'inicio' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND valor::jsonb->>'fim' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND (valor::jsonb->>'inicio') < (valor::jsonb->>'fim')
    AND jsonb_typeof(valor::jsonb->'antecedencia') = 'number'
    AND (valor::jsonb->>'antecedencia') ~ '^[0-9]{1,3}$'
    AND (valor::jsonb->>'antecedencia')::numeric BETWEEN 0 AND 168
    AND jsonb_typeof(valor::jsonb->'confirmacao') = 'string'
    AND jsonb_typeof(valor::jsonb->'lembrete') = 'string'
    AND jsonb_typeof(valor::jsonb->'reengajamento') = 'string'
    AND length(valor::jsonb->>'confirmacao') <= 2000
    AND length(valor::jsonb->>'lembrete') <= 2000
    AND length(valor::jsonb->>'reengajamento') <= 2000
    AND octet_length(valor) <= 64000
ELSE TRUE END IS TRUE);
