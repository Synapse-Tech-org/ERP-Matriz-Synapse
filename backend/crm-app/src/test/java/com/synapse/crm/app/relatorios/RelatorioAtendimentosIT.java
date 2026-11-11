package com.synapse.crm.app.relatorios;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.synapse.crm.app.PostgresIT;
import com.synapse.crm.app.seguranca.ApoioAutenticacao;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
class RelatorioAtendimentosIT extends PostgresIT {
    private static final String ROTA = "/api/v1/relatorios/atendimentos";

    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    @Test
    void apiPaginaAgregaExportaEImpedeAcessoSemCapacidade() throws Exception {
        String gestor = ApoioAutenticacao.login(http, ApoioAutenticacao.EMAIL_GESTOR,
                ApoioAutenticacao.SENHA_GESTOR).accessToken();
        String atendente = ApoioAutenticacao.login(http, ApoioAutenticacao.EMAIL_ANA,
                ApoioAutenticacao.SENHA_ATENDENTE).accessToken();
        UUID idDaAna = jdbc.queryForObject("SELECT id FROM usuario WHERE email = ?", UUID.class, ApoioAutenticacao.EMAIL_ANA);
        UUID lead = UUID.randomUUID();
        UUID finalizado = UUID.randomUUID();
        UUID aberto = UUID.randomUUID();
        String termo = "Relatorio" + lead.toString().substring(0, 8);
        LocalDate hoje = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
        // Ontem evita que o teste mude de dia enquanto prepara o atendimento.
        LocalDate dia = hoje.minusDays(1);
        var inicio = java.sql.Timestamp.from(dia.atTime(12, 0).atZone(ZoneId.of("America/Sao_Paulo")).toInstant());
        String filtro = "?periodo=PERSONALIZADO&inicio=" + dia + "&fim=" + dia + "&busca=" + termo;
        try {
            jdbc.update("INSERT INTO lead (id, nome, empresa) VALUES (?, ?, ?)", lead, "=1+1 " + termo, termo);
            jdbc.update("""
                    INSERT INTO atendimento (id, lead_id, atendente_id, status, iniciado_em, finalizado_em)
                    VALUES (?, ?, ?, 'FINALIZADO', ?, CAST(? AS timestamptz) + interval '15 minutes')
                    """, finalizado, lead, idDaAna, inicio, inicio);
            jdbc.update("""
                    INSERT INTO atendimento (id, lead_id, atendente_id, status, iniciado_em)
                    VALUES (?, ?, ?, 'EM_ATENDIMENTO', CAST(? AS timestamptz) + interval '20 minutes')
                    """, aberto, lead, idDaAna, inicio);
            jdbc.update("INSERT INTO avaliacao (atendimento_id, atendente_id, nota) VALUES (?, ?, 8)", finalizado, idDaAna);

            assertThat(get(gestor, ROTA + filtro).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            jdbc.update("UPDATE feature_flag SET habilitado = true WHERE chave = 'relatorios'");
            await().atMost(Duration.ofSeconds(8)).untilAsserted(() ->
                    assertThat(get(gestor, ROTA + filtro).getStatusCode()).isEqualTo(HttpStatus.OK));

            var pagina = json.readTree(get(gestor, ROTA + filtro + "&tamanho=1").getBody());
            assertThat(pagina.path("linhas").size()).isEqualTo(1);
            assertThat(pagina.path("linhas").get(0).path("id").asText()).isEqualTo(aberto.toString());
            assertThat(pagina.path("resumo").path("total").asLong()).isEqualTo(2);
            assertThat(pagina.path("resumo").path("duracaoMediaSegundos").asLong()).isEqualTo(900);
            assertThat(pagina.path("resumo").path("csatMedio").asDouble()).isEqualTo(8);
            assertThat(pagina.path("porStatus").size()).isEqualTo(2);
            assertThat(get(gestor, ROTA + filtro + "&pagina=1&tamanho=1").getBody()).contains(finalizado.toString());

            var csv = get(gestor, ROTA + "/exportacao" + filtro + "&status=FINALIZADO");
            assertThat(csv.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(csv.getHeaders().getContentType().toString()).startsWith("text/csv");
            assertThat(csv.getBody()).contains(finalizado.toString(), "'=1+1 " + termo).doesNotContain(aberto.toString());
            assertThat(get(atendente, ROTA + filtro).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(get(atendente, ROTA + "/exportacao" + filtro).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(get(gestor, ROTA + "?periodo=PERSONALIZADO").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        } finally {
            jdbc.update("UPDATE feature_flag SET habilitado = false WHERE chave = 'relatorios'");
            jdbc.update("DELETE FROM avaliacao WHERE atendimento_id = ?", finalizado);
            jdbc.update("DELETE FROM atendimento WHERE id IN (?, ?)", finalizado, aberto);
            jdbc.update("DELETE FROM lead WHERE id = ?", lead);
        }
    }

    private ResponseEntity<String> get(String token, String rota) {
        var headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return http.exchange(rota, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }
}
