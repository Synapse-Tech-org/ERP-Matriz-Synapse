package com.synapse.crm.app.relatorios;

import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ANA;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_GESTOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ATENDENTE;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_GESTOR;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mockingDetails;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionTemplate;

import com.synapse.crm.app.PostgresIT;
import com.synapse.crm.app.seguranca.ApoioAutenticacao;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "synapse.dashboard.clientes-do-site.habilitado=true",
            "synapse.dashboard.clientes-do-site.frase=" + DashboardClientesDoSiteIT.FRASE,
            "synapse.tenant.timezone=America/Sao_Paulo"
        })
@ActiveProfiles("dev")
class DashboardClientesDoSiteIT extends PostgresIT {
    static final String FRASE = "Olá. Vim pela página de teste.";
    private static final String URL = "/api/v1/dashboard/visao-geral";
    private static final UUID WHATSAPP = UUID.fromString("ca000000-0000-4000-8000-000000000001");
    private static final Instant INICIO = Instant.parse("2041-08-01T03:00:00Z");
    private static final Instant FIM = Instant.parse("2041-09-01T03:00:00Z");
    private static final Instant CRIACAO = INICIO.minusSeconds(86400);

    @Autowired
    private TestRestTemplate http;

    @MockitoSpyBean
    private JdbcTemplate jdbc;

    @AfterEach
    void limpar() {
        jdbc.update("""
                DELETE FROM mensagem WHERE atendimento_id IN (
                    SELECT a.id FROM atendimento a JOIN lead l ON l.id = a.lead_id WHERE l.nome = 'KPI-SITE-contrato')
                """);
        jdbc.update("DELETE FROM atendimento WHERE lead_id IN (SELECT id FROM lead WHERE nome = 'KPI-SITE-contrato')");
        jdbc.update("DELETE FROM lead WHERE nome = 'KPI-SITE-contrato'");
        jdbc.update("DELETE FROM canal WHERE nome = 'KPI-SITE-Outro'");
    }

    @Test
    void contaPrimeiroContatoPorLeadNaDataDaMensagemEComCoorte() {
        UUID leadRepetido = lead(CRIACAO);
        UUID primeiro = atendimento(leadRepetido, WHATSAPP);
        mensagem(primeiro, "IA", "TEXTO", "Olá", INICIO.minusSeconds(3));
        mensagem(primeiro, "LEAD", "TEXTO", " \t OLÁ.  VIM PELA\nPÁGINA DE TESTE.  ", INICIO);
        mensagem(primeiro, "LEAD", "TEXTO", FRASE, INICIO.plusSeconds(2));
        mensagem(atendimento(leadRepetido, WHATSAPP), "LEAD", "TEXTO", FRASE, INICIO.plusSeconds(50));
        mensagem(atendimento(lead(INICIO), WHATSAPP), "LEAD", "TEXTO", FRASE, FIM.minusSeconds(1));
        mensagem(atendimento(lead(CRIACAO), WHATSAPP), "LEAD", "TEXTO", FRASE, FIM);

        UUID tardia = atendimento(lead(CRIACAO), WHATSAPP);
        mensagem(tardia, "LEAD", "IMAGEM", null, INICIO.minusSeconds(1));
        mensagem(tardia, "LEAD", "TEXTO", FRASE, INICIO.plusSeconds(1));
        UUID fraseDeTerceiros = atendimento(lead(CRIACAO), WHATSAPP);
        for (String remetente : List.of("ATENDENTE", "IA", "SISTEMA")) {
            mensagem(fraseDeTerceiros, remetente, "TEXTO", FRASE, INICIO);
        }
        mensagem(atendimento(lead(CRIACAO), WHATSAPP), "LEAD", "TEXTO", FRASE + " Extra", INICIO);
        mensagem(atendimento(lead(CRIACAO), WHATSAPP), "LEAD", "TEXTO", "Olá! Vim pela página de teste.", INICIO);
        UUID outroCanal = jdbc.queryForObject(
                "INSERT INTO canal (nome, tipo) VALUES ('KPI-SITE-Outro', 'OUTRO') RETURNING id", UUID.class);
        mensagem(atendimento(lead(CRIACAO), outroCanal), "LEAD", "TEXTO", FRASE, INICIO);

        String token = ApoioAutenticacao.login(http, EMAIL_GESTOR, SENHA_GESTOR).accessToken();
        String agosto = "?ano=2041&meses=8";
        assertThat(contagem(token, agosto)).isEqualTo(2);
        assertThat(contagem(token, agosto)).isEqualTo(2); // mesmo campo na resposta quente
        assertThat(contagem(token, agosto + "&origemInicio=2041-07-31&origemFim=2041-07-31")).isEqualTo(1);
        assertThat(contagem(token, "?inicio=2041-08-01&fim=2041-08-01")).isEqualTo(1);
        assertThat(contagem(token, "?ano=2041&meses=7,9")).isEqualTo(1);
        assertThat(contagem(token, "?ano=2041&meses=10")).isZero();

        String atendente = ApoioAutenticacao.login(http, EMAIL_ANA, SENHA_ATENDENTE).accessToken();
        assertThat(ApoioAutenticacao.comToken(http, atendente, HttpMethod.GET, URL + agosto, String.class)
                        .getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    /** Benchmark opt-in: execute isoladamente; o descarte do container remove a massa sintética. */
    @Test
    @EnabledIfSystemProperty(named = "synapse.dashboard.benchmark-site", matches = "true")
    void planoComVolumeRepresentativo() {
        jdbc.update("""
                INSERT INTO lead (nome, status_basico, criado_em)
                SELECT 'KPI-SITE-volume-' || n, 'FINALIZADO', '2042-01-01T04:00Z'
                  FROM generate_series(1, 6000) n
                """);
        jdbc.update("""
                INSERT INTO atendimento (lead_id, canal_id, status, iniciado_em, finalizado_em)
                SELECT l.id, ?, 'FINALIZADO', inicio, inicio + interval '1 day'
                  FROM lead l CROSS JOIN LATERAL (
                      SELECT '2042-01-01T04:00Z'::timestamptz
                             + make_interval(days => (split_part(l.nome, '-', 4)::int % 360) + rodada) AS inicio
                        FROM generate_series(0, 1) rodada
                  ) criacao
                 WHERE l.nome LIKE 'KPI-SITE-volume-%'
                """, WHATSAPP);
        jdbc.update("""
                INSERT INTO mensagem (atendimento_id, remetente_tipo, tipo, conteudo, enviado_em)
                SELECT a.id,
                       (CASE WHEN n % 2 = 0 THEN 'IA' ELSE 'LEAD' END)::remetente_tipo,
                       'TEXTO', CASE WHEN n = 1 AND split_part(l.nome, '-', 4)::int % 60 = 0
                                    THEN ? ELSE 'Mensagem sintética sem marca de origem' END,
                       a.iniciado_em + make_interval(mins => n)
                  FROM atendimento a JOIN lead l ON l.id = a.lead_id
                 CROSS JOIN generate_series(1, 48) n
                 WHERE l.nome LIKE 'KPI-SITE-volume-%'
                """, FRASE);
        jdbc.execute("ANALYZE mensagem");
        jdbc.execute("ANALYZE atendimento");
        jdbc.execute("ANALYZE lead");

        String gestor = ApoioAutenticacao.login(http, EMAIL_GESTOR, SENHA_GESTOR).accessToken();
        assertThat(contagem(gestor, "?ano=2042")).isEqualTo(100);
        // Captura a instrução e os bind parameters usados pelo endpoint, sem duplicar a query.
        var chamada = mockingDetails(jdbc).getInvocations().stream()
                .filter(invocacao -> invocacao.getMethod().getName().equals("queryForObject")
                        && invocacao.getRawArguments().length == 3
                        && invocacao.getRawArguments()[0] instanceof String sql
                        && sql.contains("m.conteudo ~* ?")
                        && invocacao.getRawArguments()[1] == Long.class)
                .findFirst().orElseThrow();
        UUID gestorId = jdbc.queryForObject("SELECT id FROM usuario WHERE email = ?", UUID.class, EMAIL_GESTOR);
        JdbcTemplate planoJdbc = new JdbcTemplate(jdbc.getDataSource());
        var transacao = new TransactionTemplate(new DataSourceTransactionManager(planoJdbc.getDataSource()));
        transacao.executeWithoutResult(status -> {
            planoJdbc.execute("SET LOCAL ROLE synapse_app");
            planoJdbc.queryForList("""
                    SELECT set_config('app.usuario_id', ?, true), set_config('app.papel', 'GESTOR', true),
                           set_config('app.acesso_clientes', 'true', true)
                    """, gestorId.toString());
            assertThat(planoJdbc.queryForObject("SELECT row_security_active('lead')", Boolean.class)).isTrue();
            var plano = planoJdbc.queryForList("EXPLAIN (ANALYZE, BUFFERS) " + chamada.getRawArguments()[0],
                    String.class, (Object[]) chamada.getRawArguments()[2]);
            System.out.println("DASHBOARD_CLIENTES_DO_SITE_PLANO\n" + String.join("\n", plano));
            planoJdbc.queryForObject("SELECT set_config('app.acesso_clientes', 'false', true)", String.class);
            assertThat(planoJdbc.queryForObject((String) chamada.getRawArguments()[0],
                    Long.class, (Object[]) chamada.getRawArguments()[2])).isZero();
        });
    }

    private long contagem(String token, String filtro) {
        var resposta = ApoioAutenticacao.comToken(http, token, HttpMethod.GET, URL + filtro, JsonNode.class);
        assertThat(resposta.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode valor = resposta.getBody().path("clientesVindosDoSite");
        assertThat(valor.isIntegralNumber()).isTrue();
        return valor.asLong();
    }

    private UUID lead(Instant criadoEm) {
        return jdbc.queryForObject(
                "INSERT INTO lead (nome, status_basico, criado_em) VALUES ('KPI-SITE-contrato', 'FINALIZADO', ?) RETURNING id",
                UUID.class, Timestamp.from(criadoEm));
    }

    private UUID atendimento(UUID lead, UUID canal) {
        return jdbc.queryForObject("""
                INSERT INTO atendimento (lead_id, canal_id, status, iniciado_em, finalizado_em)
                VALUES (?, ?, 'FINALIZADO', ?, ?) RETURNING id
                """, UUID.class, lead, canal, Timestamp.from(CRIACAO), Timestamp.from(FIM.plusSeconds(1)));
    }

    private void mensagem(UUID atendimento, String remetente, String tipo, String conteudo, Instant chegada) {
        jdbc.update("""
                INSERT INTO mensagem (atendimento_id, remetente_tipo, tipo, conteudo, enviado_em)
                VALUES (?, CAST(? AS remetente_tipo), CAST(? AS tipo_mensagem), ?, ?)
                """, atendimento, remetente, tipo, conteudo, Timestamp.from(chegada));
    }
}
