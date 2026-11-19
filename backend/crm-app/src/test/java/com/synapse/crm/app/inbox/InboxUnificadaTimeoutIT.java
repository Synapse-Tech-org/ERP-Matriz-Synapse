package com.synapse.crm.app.inbox;

import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ANA;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ATENDENTE;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

import com.synapse.crm.app.PostgresIT;
import com.synapse.crm.app.seguranca.ApoioAutenticacao;

/** O prazo artificial vale exclusivamente para o pool deste contexto de injeção de falha. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "synapse.datasource.chat.hikari.connection-init-sql=SET statement_timeout = '3s'")
@ActiveProfiles("dev")
class InboxUnificadaTimeoutIT extends PostgresIT {
    @Autowired private TestRestTemplate http;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper json;

    @Test
    void timeoutRealNaoPublicaPaginaParcialELeituraSeRecupera() throws Exception {
        String token = ApoioAutenticacao.login(http, EMAIL_ANA, SENHA_ATENDENTE).accessToken();
        var antes = listar(token);
        assertThat(antes.getStatusCode()).isEqualTo(HttpStatus.OK);
        var transacao = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
        var falha = transacao.execute(tx -> {
            tx.setRollbackOnly();
            jdbc.execute("SET LOCAL lock_timeout = '3s'");
            jdbc.execute("LOCK TABLE mensagem IN ACCESS EXCLUSIVE MODE");
            return listar(token);
        });
        assertThat(falha.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(falha.getHeaders().getContentType().toString()).startsWith("application/problem+json");
        JsonNode erro = json.readTree(falha.getBody());
        assertThat(erro.path("codigo").asText()).isEqualTo("INBOX_INDISPONIVEL");
        assertThat(erro.has("itens")).isFalse();
        assertThat(erro.has("proximoCursor")).isFalse();

        var depois = listar(token);
        assertThat(depois.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(json.readTree(depois.getBody())).isEqualTo(json.readTree(antes.getBody()));
    }

    private ResponseEntity<String> listar(String token) {
        return ApoioAutenticacao.comToken(http, token, HttpMethod.GET,
                "/api/v1/atendimentos/inbox?visao=ATIVOS&limite=50", String.class);
    }
}
