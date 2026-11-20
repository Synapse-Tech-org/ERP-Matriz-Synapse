package com.synapse.crm.app.atendimento;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.atendimento.application.FinalizarAtendimentosNoFimDoExpedienteUseCase.Resultado;

/** Pool geral: é um job de fundo, nunca o caminho de mensagens. */
@Repository
class ExecucoesDaFinalizacaoNoFimDoExpedienteJdbc implements ExecucoesDaFinalizacaoNoFimDoExpediente {

    private final JdbcTemplate jdbc;

    ExecucoesDaFinalizacaoNoFimDoExpedienteJdbc(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional
    public boolean reservar(LocalDate dia, Instant iniciadaEm) {
        return jdbc.update(
                "INSERT INTO finalizacao_fim_expediente_execucao (dia, iniciada_em) VALUES (?, ?) "
                        + "ON CONFLICT (dia) DO NOTHING",
                Date.valueOf(dia), Timestamp.from(iniciadaEm)) == 1;
    }

    @Override
    @Transactional
    public void concluir(LocalDate dia, Instant concluidaEm, Resultado resultado) {
        jdbc.update(
                "UPDATE finalizacao_fim_expediente_execucao "
                        + "SET concluida_em = ?, finalizados = ?, ignorados = ?, falhas = ? WHERE dia = ?",
                Timestamp.from(concluidaEm), resultado.finalizados(), resultado.ignorados(), resultado.falhas(),
                Date.valueOf(dia));
    }
}
