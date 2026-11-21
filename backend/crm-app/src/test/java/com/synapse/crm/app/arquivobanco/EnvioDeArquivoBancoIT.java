package com.synapse.crm.app.arquivobanco;

import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ADMINISTRADOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ANA;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_BRUNO;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ADMINISTRADOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ATENDENTE;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import com.synapse.crm.app.PostgresIT;
import com.synapse.crm.app.canal.CanalFake;
import com.synapse.crm.app.midia.ArmazenamentoDeMidiaFake;
import com.synapse.crm.app.seguranca.ApoioAutenticacao;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@TestPropertySource(properties = "synapse.canal.whatsapp.provedor=fake")
class EnvioDeArquivoBancoIT extends PostgresIT {

    private static final String API = "/api/v1/banco-arquivos";
    private static final byte[] PDF = "%PDF-1.4\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);

    @Autowired private TestRestTemplate http;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private CanalFake canal;
    @Autowired private ArmazenamentoDeMidiaFake armazenamento;
    @Autowired private ObjectMapper json;
    @LocalServerPort private int porta;

    private final HttpClient clienteHttp = HttpClient.newHttpClient();
    private final UUID lead = UUID.randomUUID();
    private final UUID atendimento = UUID.randomUUID();
    private boolean flagAnterior;
    private UUID arquivoId;

    @BeforeEach
    void preparar() throws Exception {
        flagAnterior = Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT habilitado FROM feature_flag WHERE chave = 'banco_arquivos'", Boolean.class));
        jdbc.update("UPDATE feature_flag SET habilitado = true WHERE chave = 'banco_arquivos'");
        canal.abrirJanela();
        canal.religar();
        UUID ana = jdbc.queryForObject("SELECT id FROM usuario WHERE email = ?", UUID.class, EMAIL_ANA);
        String telefone = "5561" + String.format("%09d", Math.floorMod(lead.getLeastSignificantBits(), 1_000_000_000L));
        jdbc.update("""
                INSERT INTO lead (id, nome, telefone, atendente_responsavel_id, status_basico,
                                  ultima_interacao_em, ultima_mensagem_do_lead_em)
                VALUES (?, 'Cliente do teste de envio do Banco de Arquivos', ?, ?, 'EM_ATENDIMENTO', now(), now())
                """, lead, telefone, ana);
        jdbc.update("""
                INSERT INTO atendimento (id, lead_id, atendente_id, status, iniciado_em)
                VALUES (?, ?, ?, 'EM_ATENDIMENTO', now())
                """, atendimento, lead, ana);
        arquivoId = carregarPdf(token(EMAIL_ADMINISTRADOR, SENHA_ADMINISTRADOR));
    }

    @AfterEach
    void limpar() {
        jdbc.update("DELETE FROM arquivo_banco WHERE id = ?", arquivoId);
        jdbc.update("DELETE FROM outbox_evento WHERE payload->>'atendimentoId' = ?", atendimento.toString());
        jdbc.update("DELETE FROM mensagem_envio_idempotencia WHERE lead_id = ?", lead);
        jdbc.update("DELETE FROM mensagem WHERE atendimento_id = ?", atendimento);
        jdbc.update("DELETE FROM audit_log WHERE lead_id = ?", lead);
        jdbc.update("DELETE FROM atendimento WHERE id = ?", atendimento);
        jdbc.update("DELETE FROM lead WHERE id = ?", lead);
        jdbc.update("UPDATE feature_flag SET habilitado = ? WHERE chave = 'banco_arquivos'", flagAnterior);
        armazenamento.limpar();
        canal.abrirJanela();
    }

    @Test
    void enfileiraArquivoAutorizadoUmaVezMesmoComRetry() throws Exception {
        String token = token(EMAIL_ANA, SENHA_ATENDENTE);
        UUID chave = UUID.randomUUID();
        var primeira = enviar(token, chave);
        var repeticao = enviar(token, chave);

        assertThat(primeira.statusCode()).as("%s", primeira.body()).isEqualTo(200);
        assertThat(repeticao.statusCode()).isEqualTo(200);
        assertThat(repeticao.body()).isEqualTo(primeira.body());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mensagem WHERE atendimento_id = ?", Long.class, atendimento))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM outbox_evento
                WHERE tipo = 'canal.mensagem.enviar' AND payload->>'atendimentoId' = ?
                """, Long.class, atendimento.toString())).isEqualTo(1);
        String referencia = jdbc.queryForObject("SELECT midia_url FROM mensagem WHERE atendimento_id = ?",
                String.class, atendimento);
        assertThat(armazenamento.baixar(referencia)).isEqualTo(PDF);
    }

    @Test
    void recusaAtendimentoAlheioSemGravarMensagem() throws Exception {
        var resposta = enviar(token(EMAIL_BRUNO, SENHA_ATENDENTE), UUID.randomUUID());

        assertThat(resposta.statusCode()).as("%s", resposta.body()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM mensagem WHERE atendimento_id = ?", Long.class, atendimento))
                .isZero();
    }

    private UUID carregarPdf(String token) throws IOException, InterruptedException {
        String boundary = "synapse-arquivo-teste";
        String corpo = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"pasta\"\r\n\r\ncatalogos\r\n"
                + "--" + boundary + "\r\nContent-Disposition: form-data; name=\"arquivo\"; filename=\"catalogo.pdf\"\r\n"
                + "Content-Type: application/pdf\r\n\r\n" + new String(PDF, StandardCharsets.US_ASCII)
                + "\r\n--" + boundary + "--\r\n";
        var resposta = clienteHttp.send(post(API, token)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofString(corpo)).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(resposta.statusCode()).as("%s", resposta.body()).isEqualTo(201);
        return UUID.fromString(json.readTree(resposta.body()).path("id").asText());
    }

    private HttpResponse<String> enviar(String token, UUID chave) throws IOException, InterruptedException {
        String corpo = json.writeValueAsString(Map.of("atendimentoId", atendimento, "legenda", "Segue o catálogo"));
        return clienteHttp.send(post(API + "/" + arquivoId + "/enviar", token)
                .header("Content-Type", "application/json")
                .header("Idempotency-Key", chave.toString())
                .POST(HttpRequest.BodyPublishers.ofString(corpo)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpRequest.Builder post(String caminho, String token) {
        return HttpRequest.newBuilder(URI.create("http://localhost:" + porta + caminho))
                .header("Authorization", "Bearer " + token)
                .timeout(Duration.ofSeconds(20));
    }

    private String token(String email, String senha) {
        return ApoioAutenticacao.login(http, email, senha).accessToken();
    }
}
