package com.synapse.crm.app.inbox;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

/** Fixture sintética, chamada exclusivamente nos benchmarks opt-in em Testcontainers. */
public final class ApoioVolumeInbox {
    private ApoioVolumeInbox() {}

    public static void semear(JdbcTemplate jdbc, UUID ana, UUID bruno, Instant base) {
        jdbc.update("""
                INSERT INTO lead (nome, atendente_responsavel_id, status_basico)
                SELECT 'inbox-benchmark-' || n,
                       CASE WHEN n <= 160 THEN ? ELSE ? END,
                       CASE WHEN n <= 1160 THEN 'EM_ATENDIMENTO' ELSE 'FINALIZADO' END::status_basico_lead
                FROM generate_series(1, 6000) n
                """, ana, bruno);
        jdbc.update("""
                INSERT INTO atendimento (lead_id, atendente_id, status, iniciado_em)
                SELECT l.id, l.atendente_responsavel_id,
                       CASE WHEN ciclo = 8 AND l.status_basico = 'EM_ATENDIMENTO'
                            THEN 'EM_ATENDIMENTO' ELSE 'FINALIZADO' END::status_atendimento,
                       ?::timestamptz + ciclo * interval '30 minutes'
                FROM lead l CROSS JOIN generate_series(1, 8) ciclo
                WHERE l.nome LIKE 'inbox-benchmark-%'
                """, Timestamp.from(base));
        jdbc.update("""
                INSERT INTO mensagem (atendimento_id, remetente_tipo, tipo, conteudo, status_entrega, enviado_em)
                SELECT a.id, CASE WHEN n % 2 = 0 THEN 'ATENDENTE' ELSE 'LEAD' END::remetente_tipo,
                       'TEXTO', 'mensagem sintética', 'ENVIADO', a.iniciado_em + n * interval '1 second'
                FROM atendimento a JOIN lead l ON l.id = a.lead_id CROSS JOIN generate_series(1, 12) n
                WHERE l.nome LIKE 'inbox-benchmark-%'
                """);
        jdbc.update("""
                INSERT INTO atendimento_leitura (atendimento_id, usuario_id, lido_ate)
                SELECT a.id, a.atendente_id, a.iniciado_em + interval '6 seconds'
                FROM atendimento a JOIN lead l ON l.id = a.lead_id WHERE l.nome LIKE 'inbox-benchmark-%'
                """);
        jdbc.update("""
                INSERT INTO atendimento_participante (atendimento_id, usuario_id, origem)
                SELECT a.id, ?, 'CONVITE' FROM atendimento a JOIN lead l ON l.id = a.lead_id
                WHERE a.status = 'EM_ATENDIMENTO' AND l.nome LIKE 'inbox-benchmark-%' AND a.atendente_id = ?
                ORDER BY a.id LIMIT 40
                """, ana, bruno);
        jdbc.execute("ANALYZE lead, atendimento, mensagem, atendimento_leitura, atendimento_participante");
    }

    public static void limpar(JdbcTemplate jdbc) {
        jdbc.update("""
                DELETE FROM mensagem m USING atendimento a, lead l
                WHERE m.atendimento_id = a.id AND a.lead_id = l.id AND l.nome LIKE 'inbox-benchmark-%'
                """);
        jdbc.update("""
                DELETE FROM atendimento a USING lead l
                WHERE a.lead_id = l.id AND l.nome LIKE 'inbox-benchmark-%'
                """);
        jdbc.update("DELETE FROM lead WHERE nome LIKE 'inbox-benchmark-%'");
    }
}
