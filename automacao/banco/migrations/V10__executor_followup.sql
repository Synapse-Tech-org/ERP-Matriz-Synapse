-- Extensao operacional da base clonada. Nao altera tabelas do CRM nem do n8n de origem.
-- Estes campos pertencem ao executor, mantendo os controles compartilhados com o chatbot.
ALTER TABLE public.follow_ups_temporary
    ADD COLUMN executor text,
    ADD COLUMN chave_envio text,
    ADD COLUMN execucao_id text,
    ADD COLUMN botoes jsonb,
    ADD COLUMN motivo_operacional text;
CREATE UNIQUE INDEX followup_chave_envio_idx ON public.follow_ups_temporary(chave_envio);
CREATE INDEX followup_registro_pendente_idx ON public.follow_ups_temporary(id)
    WHERE executor='TYPESCRIPT' AND status='ENVIADO' AND crm_mensagem_id IS NULL;

-- Cursor e orcamento sobrevivem ao reinicio; pagina nao e limite de envios.
CREATE TABLE automacao_infra.followup_rodada (
    id uuid PRIMARY KEY,
    iniciado_em timestamptz NOT NULL DEFAULT now(),
    finalizado_em timestamptz,
    status text NOT NULL DEFAULT 'running',
    cursor_id uuid,
    ultimo_id uuid,
    tentativas_envio integer NOT NULL DEFAULT 0,
    padroes_utilizados jsonb NOT NULL DEFAULT '[]',
    motivo text
);
CREATE TABLE automacao_infra.followup_etapa (
    rodada_id uuid NOT NULL REFERENCES automacao_infra.followup_rodada(id) ON DELETE CASCADE,
    atendimento_id uuid NOT NULL,
    resultado text NOT NULL,
    duracao_ms integer NOT NULL DEFAULT 0,
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (rodada_id, atendimento_id)
);
CREATE INDEX followup_rodada_inicio_idx ON automacao_infra.followup_rodada(iniciado_em DESC);
