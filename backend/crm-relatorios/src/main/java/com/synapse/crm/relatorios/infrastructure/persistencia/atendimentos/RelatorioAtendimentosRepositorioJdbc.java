package com.synapse.crm.relatorios.infrastructure.persistencia.atendimentos;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import com.synapse.crm.relatorios.application.atendimentos.RelatorioAtendimentosRepositorio;
import com.synapse.crm.relatorios.domain.atendimentos.FiltroRelatorioAtendimentos;
import com.synapse.crm.relatorios.domain.atendimentos.RelatorioAtendimentos;
import com.synapse.crm.relatorios.domain.atendimentos.RelatorioAtendimentos.Grupo;
import com.synapse.crm.relatorios.domain.atendimentos.RelatorioAtendimentos.Linha;
import com.synapse.crm.relatorios.domain.atendimentos.RelatorioAtendimentos.Resumo;

/** Read model no pool geral, sob as RLS de atendimento e lead. */
@Repository
class RelatorioAtendimentosRepositorioJdbc implements RelatorioAtendimentosRepositorio {
    private static final String BASE = """
            SELECT a.id, a.lead_id, l.nome AS cliente, l.empresa, a.atendente_id, u.nome AS atendente,
                   e.id AS etapa_id, e.nome AS etapa, a.status::text AS status, a.iniciado_em, a.finalizado_em,
                   CASE WHEN a.finalizado_em >= a.iniciado_em
                        THEN EXTRACT(EPOCH FROM a.finalizado_em - a.iniciado_em)::bigint END AS duracao,
                   av.nota AS csat
              FROM atendimento a
              JOIN lead l ON l.id = a.lead_id
              LEFT JOIN usuario u ON u.id = a.atendente_id
              LEFT JOIN etapa_atendimento e ON e.id = l.etapa_atendimento_id
              LEFT JOIN avaliacao av ON av.atendimento_id = a.id
             WHERE a.iniciado_em >= :inicio AND a.iniciado_em < :fim
            """;
    private static final String RECORTE = """
            (CAST(:status AS text) IS NULL OR status = :status)
            AND (CAST(:etapa AS uuid) IS NULL OR etapa_id = :etapa)
            AND (CAST(:atendente AS uuid) IS NULL OR atendente_id = :atendente)
            """;
    private static final String RESUMO = """
            SELECT count(*) AS total, count(*) FILTER (WHERE status = 'FINALIZADO') AS finalizados,
                   round(avg(duracao) FILTER (WHERE status = 'FINALIZADO'))::bigint AS duracao_media,
                   round(avg(csat), 1) AS csat_medio, count(csat) AS avaliacoes
              FROM base WHERE
            """;
    private static final String GRUPOS = """
            SELECT CASE WHEN GROUPING(status) = 0 THEN 'status'
                        WHEN GROUPING(etapa_id) = 0 THEN 'etapa' ELSE 'atendente' END AS dimensao,
                   CASE WHEN GROUPING(status) = 0 THEN status
                        WHEN GROUPING(etapa_id) = 0 THEN etapa_id::text ELSE atendente_id::text END AS id,
                   coalesce(etapa, atendente, status) AS nome,
                   count(*) AS total, round(avg(csat), 1) AS csat_medio
              FROM base
             GROUP BY GROUPING SETS ((status), (etapa_id, etapa), (atendente_id, atendente))
             ORDER BY total DESC, nome, id
            """;

    private final NamedParameterJdbcTemplate jdbc;

    RelatorioAtendimentosRepositorioJdbc(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public RelatorioAtendimentos consultar(FiltroRelatorioAtendimentos filtro, int pagina, int tamanho, String fuso) {
        var parametros = parametros(filtro);
        String base = base(filtro);
        var resumo = jdbc.queryForObject(base + RESUMO + RECORTE, parametros, (rs, n) -> new Resumo(
                rs.getLong("total"), rs.getLong("finalizados"), rs.getObject("duracao_media", Long.class),
                rs.getBigDecimal("csat_medio"), rs.getLong("avaliacoes")));
        var grupos = jdbc.query(base + GRUPOS, parametros, (rs, n) -> new Dimensao(
                rs.getString("dimensao"), new Grupo(rs.getString("id"), rs.getString("nome"),
                        rs.getLong("total"), rs.getBigDecimal("csat_medio"))));
        return new RelatorioAtendimentos(listar(filtro, tamanho, (long) pagina * tamanho), resumo,
                grupos(grupos, "status"), grupos(grupos, "etapa"), grupos(grupos, "atendente"), fuso);
    }

    @Override
    public List<Linha> listar(FiltroRelatorioAtendimentos filtro, int limite, long deslocamento) {
        return jdbc.query(base(filtro) + "SELECT id, lead_id, cliente, empresa, "
                + "atendente, etapa, status, iniciado_em, finalizado_em, duracao, csat FROM base WHERE "
                + RECORTE + " ORDER BY iniciado_em DESC, id DESC LIMIT :limite OFFSET :deslocamento",
                parametros(filtro).addValue("limite", limite).addValue("deslocamento", deslocamento),
                (rs, n) -> linha(rs));
    }

    private static String base(FiltroRelatorioAtendimentos filtro) {
        String busca = filtro.busca().isEmpty() ? "" : """
                AND (l.nome ILIKE :busca ESCAPE '!' OR l.empresa ILIKE :busca ESCAPE '!'
                     OR a.id::text ILIKE :busca ESCAPE '!')
                """;
        return "WITH base AS (" + BASE + busca + ") ";
    }

    private static MapSqlParameterSource parametros(FiltroRelatorioAtendimentos filtro) {
        return new MapSqlParameterSource()
                .addValue("inicio", Timestamp.from(filtro.inicio()))
                .addValue("fim", Timestamp.from(filtro.fimExclusivo()))
                .addValue("status", filtro.status() == null ? null : filtro.status().name(), Types.VARCHAR)
                .addValue("etapa", filtro.etapa(), Types.OTHER)
                .addValue("atendente", filtro.atendente(), Types.OTHER)
                .addValue("busca", "%" + filtro.busca().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
    }

    private static Linha linha(ResultSet rs) throws SQLException {
        var fim = rs.getTimestamp("finalizado_em");
        return new Linha(rs.getObject("id", UUID.class), rs.getObject("lead_id", UUID.class),
                rs.getString("cliente"), rs.getString("empresa"), rs.getString("atendente"),
                rs.getString("etapa"), rs.getString("status"), rs.getTimestamp("iniciado_em").toInstant(),
                fim == null ? null : fim.toInstant(), rs.getObject("duracao", Long.class),
                rs.getObject("csat", Integer.class));
    }

    private static List<Grupo> grupos(List<Dimensao> grupos, String dimensao) {
        return grupos.stream().filter(g -> g.nome().equals(dimensao)).map(Dimensao::grupo).toList();
    }

    private record Dimensao(String nome, Grupo grupo) {}
}
