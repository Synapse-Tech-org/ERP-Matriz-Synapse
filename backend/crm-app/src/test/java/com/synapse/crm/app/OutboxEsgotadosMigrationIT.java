package com.synapse.crm.app;

import static com.synapse.crm.app.config.FlywayValidacaoNoBootConfig.usarLockDeSessao;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import java.sql.Connection;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

import com.synapse.crm.app.config.FlywayValidacaoNoBootConfig;

class OutboxEsgotadosMigrationIT extends PostgresIT {

    private static final String BANCO = "outbox_esgotados_migration_it";
    private static final String INDICE_MANUAL = """
            CREATE INDEX CONCURRENTLY idx_outbox_esgotados_por_tipo
                ON public.outbox_evento (tipo) WHERE esgotado_em IS NOT NULL
            """;
    private static final String CONSULTA_ALERTA =
            "SELECT count(*) FROM outbox_evento WHERE tipo = ? AND esgotado_em IS NOT NULL";
    private static final PGSimpleDataSource DATA_SOURCE = dataSourceIsolado();
    private final JdbcTemplate jdbc = new JdbcTemplate(DATA_SOURCE);

    @BeforeAll
    static void criarBancoIsolado() throws Exception {
        try (Connection conexao = java.sql.DriverManager.getConnection(
                        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
                var comando = conexao.createStatement()) {
            comando.execute("CREATE DATABASE " + BANCO);
        }
    }

    @BeforeEach
    void prepararSchemaAnterior() {
        jdbc.execute("DROP SCHEMA IF EXISTS public CASCADE");
        jdbc.execute("CREATE SCHEMA public AUTHORIZATION CURRENT_USER");
        jdbc.execute("GRANT ALL ON SCHEMA public TO PUBLIC");
        usarLockDeSessao(configuracao()).target("127").load().migrate();
    }

    @Test
    void criaIndiceEPermiteIndexOnlyScanParaOsDoisAlertas() {
        jdbc.update("""
                INSERT INTO outbox_evento (tipo, payload, publicado_em, esgotado_em)
                SELECT CASE WHEN n % 2 = 0 THEN 'canal.mensagem.enviar' ELSE 'automacao.webhook.repassar' END,
                       '{}'::jsonb,
                       CASE WHEN n > 40 THEN now() END,
                       CASE WHEN n <= 40 THEN now() END
                  FROM generate_series(1, 50000) n
                """);

        migrarNoBoot();
        assertThat(indiceValido()).isTrue();
        assertThat(migrationRegistradaComSucesso()).isTrue();
        jdbc.execute("VACUUM ANALYZE outbox_evento");

        for (String tipo : List.of("canal.mensagem.enviar", "automacao.webhook.repassar")) {
            assertThat(jdbc.queryForObject(CONSULTA_ALERTA, Long.class, tipo)).isEqualTo(20L);
            var plano = jdbc.queryForList("EXPLAIN " + CONSULTA_ALERTA, String.class, tipo);
            assertThat(plano).anySatisfy(linha ->
                    assertThat(linha).contains("Index Only Scan", "idx_outbox_esgotados_por_tipo"));
        }
    }

    @Test
    void reconheceIndiceManualValidoSemRecriar() {
        jdbc.execute(INDICE_MANUAL);
        Long oidOriginal = oidDoIndice();
        assertThat(oidOriginal).isNotNull();

        migrarNoBoot();

        assertThat(migrationRegistradaComSucesso()).isTrue();
        assertThat(indiceValido()).isTrue();
        assertThat(oidDoIndice()).isEqualTo(oidOriginal);
    }

    @Test
    void recusaIndiceValidoComMesmoNomeEPredicadoDiferente() {
        jdbc.execute("""
                CREATE INDEX idx_outbox_esgotados_por_tipo
                    ON public.outbox_evento (tipo) WHERE esgotado_em IS NULL
                """);
        Long oidOriginal = oidDoIndice();
        assertThat(indiceValido()).isTrue();

        assertThatThrownBy(OutboxEsgotadosMigrationIT::migrarNoBoot)
                .isInstanceOf(FlywayException.class)
                .hasStackTraceContaining("idx_outbox_esgotados_por_tipo inválido ou divergente");

        assertThat(migrationRegistradaComSucesso()).isFalse();
        assertThat(oidDoIndice()).isEqualTo(oidOriginal);
    }

    @Test
    void permiteEscritaEnquantoCriaIndiceERecusaResiduoInvalidoAposCancelamento() throws Exception {
        var pidDaConstrucao = new AtomicInteger();
        try (var executor = Executors.newSingleThreadExecutor();
                var escritorAnterior = DATA_SOURCE.getConnection()) {
            escritorAnterior.setAutoCommit(false);
            inserirEvento(escritorAnterior, "teste.anterior");
            var migracao = executor.submit(OutboxEsgotadosMigrationIT::migrarNoBoot);
            await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
                var pids = jdbc.queryForList("""
                        SELECT pid FROM pg_stat_progress_create_index
                         WHERE datname = current_database() AND relid = 'public.outbox_evento'::regclass
                           AND index_relid = to_regclass('public.idx_outbox_esgotados_por_tipo')
                           AND phase = 'waiting for writers before build'
                        """, Integer.class);
                assertThat(pids).hasSize(1);
                pidDaConstrucao.set(pids.getFirst());
            });

            // A migration ainda aguarda a transação anterior, mas outro escritor entra e faz commit.
            try (var escritorNovo = DATA_SOURCE.getConnection()) {
                assertThat(escritorNovo.getAutoCommit()).isTrue();
                inserirEvento(escritorNovo, "teste.durante");
            }
            assertThat(migracao.isDone()).isFalse();

            assertThat(jdbc.queryForObject("SELECT pg_cancel_backend(?)", Boolean.class, pidDaConstrucao.get()))
                    .isTrue();
            assertThatThrownBy(() -> migracao.get(20, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(FlywayException.class)
                    .hasStackTraceContaining("canceling statement due to user request");
            escritorAnterior.commit();
        }

        assertThat(indiceValido()).isFalse();
        assertThat(migrationRegistradaComSucesso()).isFalse();
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM outbox_evento WHERE tipo IN ('teste.anterior', 'teste.durante')",
                        Long.class))
                .isEqualTo(2L);

        // Em banco descartável, reproduz o caso de um índice manual interrompido sem histórico de falha.
        Flyway flyway = usarLockDeSessao(configuracao()).load();
        flyway.repair();
        Long oidInvalido = oidDoIndice();
        assertThatThrownBy(OutboxEsgotadosMigrationIT::migrarNoBoot)
                .isInstanceOf(FlywayException.class)
                .hasStackTraceContaining("idx_outbox_esgotados_por_tipo inválido ou divergente");
        assertThat(oidDoIndice()).isEqualTo(oidInvalido);

        jdbc.execute("DROP INDEX CONCURRENTLY public.idx_outbox_esgotados_por_tipo");
        flyway.repair();
        migrarNoBoot();
        assertThat(indiceValido()).isTrue();
        assertThat(migrationRegistradaComSucesso()).isTrue();
    }

    private static void inserirEvento(Connection conexao, String tipo) throws Exception {
        try (var comando = conexao.prepareStatement(
                "INSERT INTO outbox_evento (tipo, payload) VALUES (?, '{}'::jsonb)")) {
            comando.setQueryTimeout(3);
            comando.setString(1, tipo);
            assertThat(comando.executeUpdate()).isEqualTo(1);
        }
    }

    /** Usa os dois beans do boot normal; não executa o SQL avulso nem o runner exclusivo da V73. */
    private static void migrarNoBoot() {
        try (var contexto = new AnnotationConfigApplicationContext(FlywayValidacaoNoBootConfig.class)) {
            var configuracao = configuracao();
            contexto.getBean(FlywayConfigurationCustomizer.class).customize(configuracao);
            contexto.getBean(FlywayMigrationStrategy.class).migrate(configuracao.load());
        }
    }

    private Boolean indiceValido() {
        return jdbc.queryForObject("""
                SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass('public.idx_outbox_esgotados_por_tipo')
                """, Boolean.class);
    }

    private Long oidDoIndice() {
        return jdbc.queryForObject(
                "SELECT to_regclass('public.idx_outbox_esgotados_por_tipo')::oid::bigint", Long.class);
    }

    private Boolean migrationRegistradaComSucesso() {
        return jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM flyway_schema_history WHERE version = '128' AND success)", Boolean.class);
    }

    private static FluentConfiguration configuracao() {
        return Flyway.configure()
                .dataSource(DATA_SOURCE)
                .locations("classpath:db/migration")
                .ignoreMigrationPatterns("*:pending", "*:future")
                .placeholders(Map.of("telefone_ddi_padrao", "55"));
    }

    private static PGSimpleDataSource dataSourceIsolado() {
        var dataSource = new PGSimpleDataSource();
        dataSource.setServerNames(new String[] {POSTGRES.getHost()});
        dataSource.setPortNumbers(new int[] {POSTGRES.getFirstMappedPort()});
        dataSource.setDatabaseName(BANCO);
        dataSource.setUser(POSTGRES.getUsername());
        dataSource.setPassword(POSTGRES.getPassword());
        return dataSource;
    }
}
