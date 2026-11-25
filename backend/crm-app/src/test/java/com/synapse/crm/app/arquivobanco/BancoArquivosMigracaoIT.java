package com.synapse.crm.app.arquivobanco;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Map;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.jdbc.core.JdbcTemplate;

import com.synapse.crm.app.PostgresIT;
import com.synapse.crm.app.config.FlywayValidacaoNoBootConfig;

class BancoArquivosMigracaoIT extends PostgresIT {

    @Test
    void bootPreservaV126DeConfiguracoesEInstalaBancoDeArquivos() throws SQLException {
        var dataSource = criarBancoIsolado();
        var jdbc = new JdbcTemplate(dataSource);
        flywayAte(dataSource, "126").migrate();

        String consultaV126 = "SELECT script, checksum, success FROM flyway_schema_history WHERE version = '126'";
        var historicoV126 = jdbc.queryForMap(consultaV126);
        assertThat(historicoV126).containsEntry("script", "V126__configuracoes_gerais_fim_do_expediente.sql");
        UUID legado = jdbc.queryForObject("""
                INSERT INTO arquivo_banco (nome, tipo, url)
                VALUES ('legado.pdf', 'PDF', 'fixture/legado.pdf') RETURNING id
                """, UUID.class);

        var flyway = flywayAte(dataSource, "129");
        new FlywayValidacaoNoBootConfig().validarSchemaSemMigrarNoBoot().migrate(flyway);
        flyway.validate();

        assertThat(jdbc.queryForMap(consultaV126)).isEqualTo(historicoV126);
        assertThat(jdbc.queryForList("""
                SELECT script FROM flyway_schema_history
                WHERE version IN ('127', '128', '129') AND success
                ORDER BY installed_rank
                """, String.class)).containsExactly(
                "V127__parametros_mensagens_sistematicas.sql",
                "V128__banco_de_arquivos.sql",
                "V129__formatos_de_anexo_no_banco_de_arquivos.sql");
        assertThat(jdbc.queryForObject("SELECT url FROM arquivo_banco WHERE id = ?", String.class, legado))
                .isEqualTo("fixture/legado.pdf");
        assertThat(jdbc.queryForObject(
                "SELECT habilitado FROM feature_flag WHERE chave = 'banco_arquivos'", Boolean.class)).isFalse();
    }

    private static PGSimpleDataSource criarBancoIsolado() throws SQLException {
        String banco = "synapse_banco_arquivos_migracao_it";
        try (var conexao = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
                var comando = conexao.createStatement()) {
            comando.execute("CREATE DATABASE " + banco);
        }
        var dataSource = new PGSimpleDataSource();
        dataSource.setServerNames(new String[]{POSTGRES.getHost()});
        dataSource.setPortNumbers(new int[]{POSTGRES.getFirstMappedPort()});
        dataSource.setDatabaseName(banco);
        dataSource.setUser(POSTGRES.getUsername());
        dataSource.setPassword(POSTGRES.getPassword());
        return dataSource;
    }

    private static Flyway flywayAte(PGSimpleDataSource dataSource, String alvo) {
        return Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .placeholders(Map.of("telefone_ddi_padrao", "55"))
                .ignoreMigrationPatterns("*:pending", "*:future")
                .target(alvo)
                .load();
    }
}
