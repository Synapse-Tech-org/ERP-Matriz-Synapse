-- Os alertas consultam somente o histórico esgotado por tipo.
-- IF NOT EXISTS preserva o índice aplicado manualmente; não garante equivalência.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outbox_esgotados_por_tipo
    ON public.outbox_evento USING btree (tipo)
    WHERE esgotado_em IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_index i
          JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
          JOIN pg_catalog.pg_am am ON am.oid = c.relam
          JOIN pg_catalog.pg_opclass op ON op.oid = i.indclass[0]
          JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attname = 'tipo'
         WHERE i.indexrelid = pg_catalog.to_regclass('public.idx_outbox_esgotados_por_tipo')
           AND i.indrelid = 'public.outbox_evento'::regclass
           AND c.relkind = 'i'
           AND i.indisvalid AND i.indisready AND i.indislive
           AND NOT i.indisunique
           AND am.amname = 'btree' AND op.opcdefault
           AND i.indnkeyatts = 1 AND i.indnatts = 1
           AND i.indkey[0] = a.attnum AND i.indcollation[0] = a.attcollation AND i.indoption[0] = 0
           AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) = '(esgotado_em IS NOT NULL)'
    ) THEN
        RAISE EXCEPTION 'V128: índice idx_outbox_esgotados_por_tipo inválido ou divergente'
            USING HINT = 'Inspecione a definição e siga o runbook da V128; nenhum objeto foi removido';
    END IF;
END
$$;
