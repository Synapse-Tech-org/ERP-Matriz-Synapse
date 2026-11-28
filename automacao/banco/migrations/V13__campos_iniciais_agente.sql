-- Uma linha sem texto representa um campo aguardando preenchimento no painel.
ALTER TABLE automacao_infra.prompt_conversa ALTER COLUMN valor DROP NOT NULL;
INSERT INTO automacao_infra.prompt_conversa(chave,valor,atualizado_por)
SELECT 'conversa.ia.prompt.' || campo,NULL,'provisionamento'
FROM unnest(ARRAY['global','router','institucional','triagem','contexto','contexto_institucional']) AS campo
ON CONFLICT (chave) DO NOTHING;
