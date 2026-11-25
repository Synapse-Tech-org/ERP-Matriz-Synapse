package com.synapse.crm.equipe.infrastructure.persistencia;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.synapse.crm.equipe.application.usuario.PresencaOperacionalRepositorio;
import com.synapse.crm.equipe.domain.usuario.PresencaOperacional.Ajuste;
import com.synapse.crm.equipe.domain.usuario.PresencaOperacional.Estado;

@Repository
class PresencaOperacionalRepositorioJdbc implements PresencaOperacionalRepositorio {
    private final JdbcTemplate jdbc;

    PresencaOperacionalRepositorioJdbc(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Situacao ler(UUID usuarioId, boolean comSetores, Instant agora) {
        return jdbc.queryForObject(
                """
                SELECT u.presenca_gestao, u.presenca_gestao_ate,
                       ? AND NOT (TRUE %s) AS fora_do_setor
                  FROM usuario u
                 WHERE u.id = ?
                """.formatted(AtendenteDisponivelRepositorioJdbc.FILTRO_SETOR_QUE_NAO_RECEBE),
                (rs, i) -> {
                    OffsetDateTime ate = rs.getObject("presenca_gestao_ate", OffsetDateTime.class);
                    boolean vigente = ate != null && ate.toInstant().isAfter(agora);
                    return new Situacao(
                            vigente ? Ajuste.valueOf(rs.getString("presenca_gestao")) : null,
                            vigente ? ate.toInstant() : null,
                            rs.getBoolean("fora_do_setor"));
                }, comSetores, usuarioId);
    }

    @Override
    public void gravar(UUID usuarioId, UUID autorId, Estado anterior, Ajuste novo, Instant agora, Instant validoAte) {
        OffsetDateTime ate = validoAte.atOffset(ZoneOffset.UTC);
        jdbc.update("UPDATE usuario SET presenca_gestao = ?, presenca_gestao_ate = ? WHERE id = ?",
                novo.name(), ate, usuarioId);
        jdbc.update(
                """
                INSERT INTO presenca_gestao_historico
                    (usuario_id, autor_id, estado_anterior, estado_novo, registrado_em, valido_ate)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                usuarioId, autorId, anterior.name(), novo.name(), agora.atOffset(ZoneOffset.UTC), ate);
    }
}
