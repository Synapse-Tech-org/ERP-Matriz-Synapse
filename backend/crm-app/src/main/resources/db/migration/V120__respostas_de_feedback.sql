ALTER TABLE feedback_usuario
    ADD COLUMN resposta text CHECK (char_length(btrim(resposta)) BETWEEN 1 AND 2000),
    ADD COLUMN respondido_em timestamptz,
    ADD CONSTRAINT feedback_resposta_com_data CHECK ((resposta IS NULL) = (respondido_em IS NULL));

GRANT UPDATE (resposta, respondido_em) ON feedback_usuario TO synapse_app;

CREATE POLICY rls_feedback_resposta ON feedback_usuario
    FOR UPDATE
    USING (current_setting('app.papel', TRUE) = 'ADMINISTRADOR')
    WITH CHECK (current_setting('app.papel', TRUE) = 'ADMINISTRADOR');
