package com.synapse.crm.app.equipe;

import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ANA;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_BRUNO;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_GESTOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ATENDENTE;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_GESTOR;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
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
import com.synapse.crm.app.seguranca.ApoioAutenticacao;

/**
 * Quem entra num grupo depois vê o histórico inteiro, e a paginação por cursor o entrega sem buraco.
 *
 * <p>O relato do Financeiro era "não consigo ver as mensagens antigas do grupo". O servidor não filtra o
 * histórico por quem entrou quando (a tabela de participantes nem guarda a data de entrada), mas só
 * devolve 50 mensagens por página: a tela precisa seguir o {@code proximoCursor}. Este IT fixa o
 * contrato de que o front passou a depender.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
class ChatInternoHistoricoPaginadoIT extends PostgresIT {

    private static final String NOME_DO_GRUPO = "E-historico-paginado";
    private static final int TOTAL_ANTIGAS = 130;

    @Autowired
    private TestRestTemplate http;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ObjectMapper json;

    @AfterEach
    void limpar() {
        jdbc.update("DELETE FROM chat_interno_conversa WHERE nome = ?", NOME_DO_GRUPO);
    }

    @Test
    @DisplayName("participante adicionado depois alcança todas as mensagens antigas, página a página, sem buraco nem repetição")
    void participanteNovo_percorreOHistoricoInteiro() throws Exception {
        String ana = ApoioAutenticacao.login(http, EMAIL_ANA, SENHA_ATENDENTE).accessToken();
        String gestor = ApoioAutenticacao.login(http, EMAIL_GESTOR, SENHA_GESTOR).accessToken();
        UUID idAna = idDo(EMAIL_ANA);
        UUID idBruno = idDo(EMAIL_BRUNO);
        UUID idGestor = idDo(EMAIL_GESTOR);

        ResponseEntity<String> criado = comToken(ana, HttpMethod.POST, "/api/v1/chat-interno/conversas/grupo",
                "{\"nome\":\"%s\",\"participantes\":[\"%s\",\"%s\"]}".formatted(NOME_DO_GRUPO, idAna, idBruno));
        assertThat(criado.getStatusCode().is2xxSuccessful()).as(criado.getBody()).isTrue();
        UUID grupo = UUID.fromString(json.readTree(criado.getBody()).path("id").asText());

        inserirHistoricoAntigo(grupo, idAna, idBruno);
        ResponseEntity<String> adicionado = comToken(ana, HttpMethod.POST,
                "/api/v1/chat-interno/conversas/" + grupo + "/participantes",
                "{\"usuarioId\":\"" + idGestor + "\"}");
        assertThat(adicionado.getStatusCode().is2xxSuccessful()).as(adicionado.getBody()).isTrue();

        List<JsonNode> recebidas = percorrerHistoricoComo(gestor, grupo);

        List<String> conteudos = recebidas.stream().map(m -> m.path("conteudo").asText()).toList();
        for (int n = 1; n <= TOTAL_ANTIGAS; n++) {
            assertThat(conteudos).as("mensagem antiga %d", n).contains("historico " + n);
        }
        Set<String> ids = new HashSet<>();
        recebidas.forEach(m -> assertThat(ids.add(m.path("id").asText())).as("sem repetição").isTrue());
        List<String> datas = recebidas.stream().map(m -> m.path("enviadoEm").asText()).toList();
        assertThat(datas).as("ordem cronológica").isEqualTo(datas.stream().sorted().toList());
        assertThat(recebidas.size()).as("130 antigas + criação do grupo + entrada do novo participante")
                .isEqualTo(TOTAL_ANTIGAS + 2);
    }

    @Test
    @DisplayName("a primeira página traz as 50 mais recentes e avisa que há mais; a última não tem cursor")
    void primeiraPagina_cheia_temCursor_eAUltimaNao() throws Exception {
        String ana = ApoioAutenticacao.login(http, EMAIL_ANA, SENHA_ATENDENTE).accessToken();
        UUID idAna = idDo(EMAIL_ANA);
        UUID idBruno = idDo(EMAIL_BRUNO);
        ResponseEntity<String> criado = comToken(ana, HttpMethod.POST, "/api/v1/chat-interno/conversas/grupo",
                "{\"nome\":\"%s\",\"participantes\":[\"%s\",\"%s\"]}".formatted(NOME_DO_GRUPO, idAna, idBruno));
        UUID grupo = UUID.fromString(json.readTree(criado.getBody()).path("id").asText());
        inserirHistoricoAntigo(grupo, idAna, idBruno);

        JsonNode primeira = json.readTree(comToken(ana, HttpMethod.GET,
                "/api/v1/chat-interno/conversas/" + grupo + "/mensagens", null).getBody());

        assertThat(primeira.path("mensagens")).hasSize(50);
        assertThat(primeira.path("proximoCursor").isNull()).isFalse();
        // O histórico é anterior à criação do grupo: a mais recente é o evento GRUPO_CRIADO, e logo antes
        // dela vêm as mais novas do histórico.
        assertThat(primeira.path("mensagens").get(49).path("conteudo").asText()).contains("GRUPO_CRIADO");
        assertThat(primeira.path("mensagens").get(48).path("conteudo").asText()).isEqualTo("historico 130");
        assertThat(primeira.path("mensagens").get(0).path("conteudo").asText()).isEqualTo("historico 82");
    }

    private List<JsonNode> percorrerHistoricoComo(String token, UUID grupo) throws Exception {
        List<JsonNode> todas = new ArrayList<>();
        String cursor = null;
        for (int pagina = 0; pagina < 10; pagina++) {
            String url = "/api/v1/chat-interno/conversas/" + grupo + "/mensagens"
                    + (cursor == null ? "" : "?antesDe=" + cursor);
            ResponseEntity<String> resposta = comToken(token, HttpMethod.GET, url, null);
            assertThat(resposta.getStatusCode().is2xxSuccessful())
                    .as("página %d (%s): %s", pagina, url, resposta.getBody())
                    .isTrue();
            JsonNode corpo = json.readTree(resposta.getBody());
            assertThat(corpo.has("proximoCursor")).as("página %d sem proximoCursor: %s", pagina, resposta.getBody()).isTrue();
            List<JsonNode> daPagina = new ArrayList<>();
            corpo.path("mensagens").forEach(daPagina::add);
            todas.addAll(0, daPagina);
            if (corpo.path("proximoCursor").isNull()) {
                return todas;
            }
            cursor = corpo.path("proximoCursor").asText();
        }
        throw new AssertionError("o cursor não terminou em 10 páginas");
    }

    private void inserirHistoricoAntigo(UUID grupo, UUID a, UUID b) {
        jdbc.update(
                """
                INSERT INTO chat_interno_mensagem (id, conversa_id, remetente_id, tipo, conteudo, enviado_em)
                SELECT gen_random_uuid(), ?, CASE WHEN g % 2 = 0 THEN ?::uuid ELSE ?::uuid END, 'TEXTO',
                       'historico ' || g, now() - ((?::int - g) || ' minutes')::interval
                  FROM generate_series(1, ?) g
                """,
                grupo, a, b, TOTAL_ANTIGAS + 5, TOTAL_ANTIGAS);
    }

    private ResponseEntity<String> comToken(String token, HttpMethod metodo, String url, String corpo) {
        HttpHeaders cabecalhos = new HttpHeaders();
        cabecalhos.setBearerAuth(token);
        cabecalhos.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange(url, metodo, new HttpEntity<>(corpo, cabecalhos), String.class);
    }

    private UUID idDo(String email) {
        return jdbc.queryForObject("SELECT id FROM usuario WHERE email = ?", UUID.class, email);
    }
}
