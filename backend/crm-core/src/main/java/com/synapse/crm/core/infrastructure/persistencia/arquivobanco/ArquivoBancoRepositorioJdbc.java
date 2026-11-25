package com.synapse.crm.core.infrastructure.persistencia.arquivobanco;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.synapse.crm.core.application.arquivobanco.ArquivoBancoRepositorio;
import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco;
import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;
import com.synapse.crm.core.domain.arquivobanco.TipoArquivoBanco;
import com.synapse.crm.core.infrastructure.persistencia.TransacaoObrigatoria;

@Repository
class ArquivoBancoRepositorioJdbc implements ArquivoBancoRepositorio {
    private static final String CAMPOS = "id, nome, pasta, tipo, mime_type, tamanho_bytes, descricao_metadados, criado_em";
    private static final String ATIVOS = " FROM arquivo_banco WHERE mime_type IS NOT NULL AND exclusao_expira_em IS NULL ";
    private static final String FILTROS = """
            AND (pasta = ? OR CAST(? AS text) IS NULL)
            AND (tipo = ? OR CAST(? AS text) IS NULL)
            AND (strpos(lower(nome), lower(?)) > 0 OR strpos(lower(coalesce(descricao_metadados, '')), lower(?)) > 0)
            """;

    private final JdbcTemplate jdbc;

    ArquivoBancoRepositorioJdbc(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Metadados> listar(Filtro filtro) {
        String tipo = filtro.tipo() == null ? null : filtro.tipo().name();
        String ordem = switch (filtro.ordem()) {
            case recentes -> "criado_em DESC, id";
            case nome -> "lower(nome), id";
            case tamanho -> "tamanho_bytes DESC, id";
        };
        return jdbc.query("SELECT " + CAMPOS + ATIVOS + FILTROS + " ORDER BY " + ordem + " LIMIT ? OFFSET ?",
                ArquivoBancoRepositorioJdbc::metadados,
                filtro.pasta(), filtro.pasta(), tipo, tipo, filtro.busca(), filtro.busca(),
                filtro.tamanho(), (long) filtro.pagina() * filtro.tamanho());
    }

    @Override
    public long contar(Filtro filtro) {
        String tipo = filtro.tipo() == null ? null : filtro.tipo().name();
        return jdbc.queryForObject("SELECT count(*)" + ATIVOS + FILTROS, Long.class,
                filtro.pasta(), filtro.pasta(), tipo, tipo, filtro.busca(), filtro.busca());
    }

    @Override
    public Map<String, Long> contarPorPasta() {
        return jdbc.query("SELECT pasta, count(*) total" + ATIVOS + " GROUP BY pasta", rs -> {
            Map<String, Long> contagens = new HashMap<>();
            while (rs.next()) {
                contagens.put(rs.getString("pasta"), rs.getLong("total"));
            }
            return Map.copyOf(contagens);
        });
    }

    @Override
    public long usadoBytes() {
        return jdbc.queryForObject("SELECT COALESCE(sum(tamanho_bytes), 0) FROM arquivo_banco WHERE mime_type IS NOT NULL",
                Long.class);
    }

    @Override
    public boolean reservarEscrita() {
        TransacaoObrigatoria.exigir("reservar espaço no Banco de Arquivos");
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT pg_try_advisory_xact_lock(hashtextextended('synapse:banco-arquivos:quota', 0))", Boolean.class));
    }

    @Override
    public void gravar(ArquivoBanco arquivo, UUID autor) {
        TransacaoObrigatoria.exigir("gravar arquivo no Banco de Arquivos");
        Metadados item = arquivo.metadados();
        jdbc.update("""
                INSERT INTO arquivo_banco (id, nome, pasta, tipo, mime_type, tamanho_bytes, descricao_metadados,
                    criado_em, url, enviado_por_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, item.id(), item.nome(), item.pasta(), item.tipo().name(), item.mimeType(), item.tamanhoBytes(),
                item.descricao(), utc(item.criadoEm()), arquivo.referencia(), autor);
    }

    @Override
    public Optional<ArquivoBanco> ativo(UUID id) {
        return jdbc.query("SELECT " + CAMPOS + ", url" + ATIVOS + " AND id = ?",
                ArquivoBancoRepositorioJdbc::arquivo, id).stream().findFirst();
    }

    @Override
    public Optional<Metadados> alterar(UUID id, String nome, String pasta, String descricao) {
        return jdbc.query("""
                UPDATE arquivo_banco SET nome = ?, pasta = COALESCE(?, pasta), descricao_metadados = ?
                WHERE id = ? AND mime_type IS NOT NULL AND exclusao_expira_em IS NULL
                RETURNING
                """ + CAMPOS, ArquivoBancoRepositorioJdbc::metadados, nome, pasta, descricao, id).stream().findFirst();
    }

    @Override
    public Optional<Metadados> mover(UUID id, String pasta) {
        return jdbc.query("""
                UPDATE arquivo_banco SET pasta = ?
                WHERE id = ? AND mime_type IS NOT NULL AND exclusao_expira_em IS NULL
                RETURNING
                """ + CAMPOS, ArquivoBancoRepositorioJdbc::metadados, pasta, id).stream().findFirst();
    }

    @Override
    public boolean excluir(UUID id, Instant expiraEm) {
        return jdbc.update("""
                UPDATE arquivo_banco SET exclusao_expira_em = ?
                WHERE id = ? AND mime_type IS NOT NULL AND exclusao_expira_em IS NULL
                """, utc(expiraEm), id) > 0;
    }

    @Override
    public Optional<Metadados> restaurar(UUID id, Instant agora) {
        return jdbc.query("""
                UPDATE arquivo_banco SET exclusao_expira_em = NULL
                WHERE id = ? AND mime_type IS NOT NULL AND exclusao_expira_em > GREATEST(?, clock_timestamp())
                RETURNING
                """ + CAMPOS, ArquivoBancoRepositorioJdbc::metadados, id, utc(agora)).stream().findFirst();
    }

    @Override
    public Optional<ArquivoBanco> expiradoParaRemover(Instant agora) {
        TransacaoObrigatoria.exigir("selecionar arquivo expirado para expurgo");
        return jdbc.query("SELECT " + CAMPOS + ", url " + """
                FROM arquivo_banco WHERE mime_type IS NOT NULL AND exclusao_expira_em <= ?
                ORDER BY exclusao_expira_em, id LIMIT 1 FOR UPDATE SKIP LOCKED
                """, ArquivoBancoRepositorioJdbc::arquivo, utc(agora)).stream().findFirst();
    }

    @Override
    public void removerExpirado(UUID id) {
        TransacaoObrigatoria.exigir("expurgar arquivo expirado");
        jdbc.update("DELETE FROM arquivo_banco WHERE id = ? AND mime_type IS NOT NULL AND exclusao_expira_em IS NOT NULL", id);
    }

    private static ArquivoBanco arquivo(ResultSet rs, int linha) throws SQLException {
        return new ArquivoBanco(metadados(rs, linha), rs.getString("url"));
    }

    private static Metadados metadados(ResultSet rs, int linha) throws SQLException {
        return new Metadados(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("pasta"),
                TipoArquivoBanco.valueOf(rs.getString("tipo")), rs.getString("mime_type"), rs.getLong("tamanho_bytes"),
                rs.getString("descricao_metadados"), rs.getObject("criado_em", OffsetDateTime.class).toInstant());
    }

    private static OffsetDateTime utc(Instant instante) {
        return instante.atOffset(ZoneOffset.UTC);
    }
}
