package com.synapse.crm.app.core;

import static com.synapse.crm.app.seguranca.ApoioAutenticacao.*;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.synapse.crm.app.PostgresIT;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
class AgendaConsultasIT extends PostgresIT {
    private static final String ROTA = "/api/v1/agenda-consultas";
    private static final String DIA = "2026-11-14";
    private static final String AGENDA_DO_DIA = ROTA + "?dia=" + DIA;
    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate banco;
    private final UUID leadAna = UUID.randomUUID();
    private final UUID leadBruno = UUID.randomUUID();
    private final String profissional = "Recepcao " + UUID.randomUUID();
    private String gestor;
    private String ana;

    @BeforeEach
    void preparar() {
        gestor = login(http, EMAIL_GESTOR, SENHA_GESTOR).accessToken();
        ana = login(http, EMAIL_ANA, SENHA_ATENDENTE).accessToken();
        inserirLead(leadAna, "Paciente de Ana", EMAIL_ANA);
        inserirLead(leadBruno, "Paciente de Bruno", EMAIL_BRUNO);
    }

    @AfterEach
    void limpar() {
        banco.update("DELETE FROM agendamento WHERE lead_id IN (?, ?)", leadAna, leadBruno);
        banco.update("DELETE FROM lead WHERE id IN (?, ?)", leadAna, leadBruno);
        flag(false);
    }

    @Test
    void agendaExigeFlagESessao() {
        flag(false);
        assertThat(http.getForEntity(AGENDA_DO_DIA, JsonNode.class).getStatusCode().value()).isEqualTo(401);
        assertThat(get(gestor, AGENDA_DO_DIA).getStatusCode().value()).isEqualTo(403);
        assertThat(criar(gestor, leadAna, "09:00").getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void agendaFiltraPelaCarteiraAntesDaBuscaENegaAlteracaoDeConsultaAlheia() {
        flag(true);
        UUID idAna = id(criar(gestor, leadAna, "09:00"));
        UUID idBruno = id(criar(gestor, leadBruno, "10:00"));

        var itens = get(ana, AGENDA_DO_DIA).getBody().path("agenda").path("itens");
        assertThat(itens).hasSize(1);
        assertThat(itens.get(0).path("id").asText()).isEqualTo(idAna.toString());
        assertThat(itens.get(0).path("inicio").asText()).isEqualTo(DIA + "T12:00:00Z");
        assertThat(get(ana, AGENDA_DO_DIA + "&busca=Bruno").getBody().path("agenda").path("itens")).isEmpty();
        assertThat(criar(ana, leadBruno, "11:30").getStatusCode().value()).isEqualTo(404);
        assertThat(alterar(ana, idBruno, Map.of("revisao", 0, "estado", "CONFIRMADO")).getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void validaHorarioVersaoTransicaoEFluxoCompleto() {
        flag(true);
        UUID id = id(criar(gestor, leadAna, "09:00"));
        assertThat(criar(gestor, leadBruno, "09:00").getStatusCode().value()).isEqualTo(409);
        assertThat(alterar(gestor, id, Map.of("revisao", 0, "estado", "ATENDIDO")).getStatusCode().value()).isEqualTo(409);
        assertThat(alterar(gestor, id, Map.of("revisao", 0, "estado", "CONFIRMADO")).getStatusCode().value()).isEqualTo(204);
        assertThat(alterar(gestor, id, Map.of("revisao", 0, "estado", "CHEGOU")).getStatusCode().value()).isEqualTo(409);
        var confirmadas = get(gestor, AGENDA_DO_DIA + "&estado=CONFIRMADO&busca=Paciente").getBody().path("agenda").path("itens");
        assertThat(confirmadas).hasSize(1);
        assertThat(confirmadas.get(0).path("revisao").asLong()).isEqualTo(1);
        assertThat(alterar(gestor, id, Map.of("revisao", 1, "inicio", DIA + "T10:00")).getStatusCode().value()).isEqualTo(204);
        assertThat(alterar(gestor, id, Map.of("revisao", 2, "estado", "CHEGOU")).getStatusCode().value()).isEqualTo(204);
        assertThat(alterar(gestor, id, Map.of("revisao", 3, "estado", "EM_ATENDIMENTO")).getStatusCode().value()).isEqualTo(204);
        assertThat(alterar(gestor, id, Map.of("revisao", 4, "estado", "ATENDIDO")).getStatusCode().value()).isEqualTo(204);
        UUID cancelada = id(criar(gestor, leadBruno, "09:00"));
        assertThat(alterar(gestor, cancelada, Map.of("revisao", 0, "estado", "CANCELADO")).getStatusCode().value()).isEqualTo(204);
        id(criar(gestor, leadAna, "09:00"));
    }

    private void inserirLead(UUID id, String nome, String dono) {
        banco.update("""
                INSERT INTO lead (id,nome,status_basico,atendente_responsavel_id)
                VALUES (?,?,'EM_ATENDIMENTO',(SELECT id FROM usuario WHERE email=?))
                """, id, nome, dono);
    }

    private void flag(boolean ativa) {
        banco.update("UPDATE feature_flag SET habilitado=? WHERE chave='variante_clinica'", ativa);
        org.awaitility.Awaitility.await().untilAsserted(() ->
                assertThat(get(gestor, AGENDA_DO_DIA).getStatusCode().value()).isEqualTo(ativa ? 200 : 403));
    }

    private ResponseEntity<JsonNode> criar(String token, UUID lead, String hora) {
        return chamada(token, HttpMethod.POST, ROTA, Map.of("leadId", lead,
                "inicio", DIA + "T" + hora, "profissional", profissional, "tipo", "Avaliação"));
    }

    private ResponseEntity<JsonNode> alterar(String token, UUID id, Map<String, Object> dados) {
        return chamada(token, HttpMethod.PATCH, ROTA + "/" + id, dados);
    }

    private ResponseEntity<JsonNode> get(String token, String rota) {
        return chamada(token, HttpMethod.GET, rota, null);
    }

    private ResponseEntity<JsonNode> chamada(String token, HttpMethod metodo, String rota, Map<String, Object> corpo) {
        var headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange(rota, metodo, new HttpEntity<>(corpo, headers), JsonNode.class);
    }

    private UUID id(ResponseEntity<JsonNode> resposta) {
        assertThat(resposta.getStatusCode().value()).as("Resposta: %s", resposta.getBody()).isEqualTo(201);
        return UUID.fromString(resposta.getBody().path("id").asText());
    }
}
