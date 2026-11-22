-- Manter as rodadas antigas e os inserts da V10 como follow-up.
ALTER TABLE automacao_infra.followup_rodada
    ADD COLUMN fluxo text NOT NULL DEFAULT 'followup-typescript',
    ADD COLUMN resultados jsonb NOT NULL DEFAULT '{}';
CREATE INDEX rodada_fluxo_inicio_idx ON automacao_infra.followup_rodada(fluxo, iniciado_em DESC);

-- Preservar a chave unica da V7 e os comprovantes mesmo apos limpar o historico.
ALTER TABLE public.ev07_envios_automaticos
    ADD COLUMN rodada_id uuid REFERENCES automacao_infra.followup_rodada(id) ON DELETE SET NULL,
    ADD COLUMN atendimento_id uuid,
    ADD COLUMN chave_envio text UNIQUE,
    ADD COLUMN provedor_id text,
    ADD COLUMN crm_id text;
CREATE INDEX ev07_rodada_idx ON public.ev07_envios_automaticos(rodada_id) WHERE rodada_id IS NOT NULL;
