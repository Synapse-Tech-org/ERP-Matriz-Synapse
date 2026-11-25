package com.synapse.crm.core.infrastructure.persistencia.arquivobanco;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.synapse.crm.core.application.arquivobanco.FalhaArquivoBanco;
import com.synapse.crm.core.application.arquivobanco.PastaArquivoBancoRepositorio;
import com.synapse.crm.core.domain.arquivobanco.PastaArquivoBanco;

@Repository
class PastaArquivoBancoRepositorioJdbc implements PastaArquivoBancoRepositorio {
    private final JdbcTemplate jdbc;

    PastaArquivoBancoRepositorioJdbc(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<PastaArquivoBanco> listar() {
        return jdbc.query("""
                SELECT id, nome, geral FROM pasta_arquivo_banco ORDER BY geral DESC, lower(nome), id
                """, PastaArquivoBancoRepositorioJdbc::mapear);
    }

    @Override
    public boolean existe(String id) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM pasta_arquivo_banco WHERE id = ?)", Boolean.class, id));
    }

    @Override
    public PastaArquivoBanco criar(UUID id, String nome) {
        try {
            return jdbc.queryForObject("""
                    INSERT INTO pasta_arquivo_banco (id, nome) VALUES (?, ?) RETURNING id, nome, geral
                    """, PastaArquivoBancoRepositorioJdbc::mapear, id.toString(), nome);
        } catch (DuplicateKeyException duplicado) {
            throw FalhaArquivoBanco.nomeDePastaEmUso();
        }
    }

    @Override
    public Optional<PastaArquivoBanco> renomear(UUID id, String nome) {
        try {
            return jdbc.query("""
                    UPDATE pasta_arquivo_banco SET nome = ? WHERE id = ? AND NOT geral RETURNING id, nome, geral
                    """, PastaArquivoBancoRepositorioJdbc::mapear, nome, id.toString()).stream().findFirst();
        } catch (DuplicateKeyException duplicado) {
            throw FalhaArquivoBanco.nomeDePastaEmUso();
        }
    }

    private static PastaArquivoBanco mapear(ResultSet rs, int linha) throws SQLException {
        return new PastaArquivoBanco(rs.getString("id"), rs.getString("nome"), rs.getBoolean("geral"));
    }
}
