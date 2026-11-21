package com.synapse.crm.app.arquivobanco;

import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ADMINISTRADOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ADMINISTRADOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.login;
import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import javax.imageio.ImageIO;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;

import com.synapse.crm.app.PostgresIT;
import com.synapse.crm.app.midia.ArmazenamentoDeMidiaFake;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
class BancoArquivosIT extends PostgresIT {
    private static final String ROTA = "/api/v1/banco-arquivos";
    private static final long QUOTA = 5L * 1024 * 1024 * 1024;
    private static final byte[] PDF = "%PDF-1.7\nTeste biblioteca\n%%EOF\n".getBytes(StandardCharsets.UTF_8);

    @Autowired TestRestTemplate api;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired ApplicationContext contexto;
    @Autowired ArmazenamentoDeMidiaFake storage;
    @LocalServerPort int porta;

    private final HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();
    private final List<UUID> criados = new ArrayList<>();
    private boolean flagAnterior;
    private String token;

    @BeforeEach void prepararBanco() {
        flagAnterior = Boolean.TRUE.equals(db.queryForObject(
                "SELECT habilitado FROM feature_flag WHERE chave='banco_arquivos'", Boolean.class));
        db.update("UPDATE feature_flag SET habilitado=true WHERE chave='banco_arquivos'");
        token = login(api, EMAIL_ADMINISTRADOR, SENHA_ADMINISTRADOR).accessToken();
    }

    @AfterEach void limparBanco() {
        criados.forEach(id -> db.query("DELETE FROM arquivo_banco WHERE id=? RETURNING url",
                (rs, linha) -> rs.getString("url"), id).forEach(storage::remover));
        db.update("UPDATE feature_flag SET habilitado=? WHERE chave='banco_arquivos'", flagAnterior);
    }

    @Test void listaBuscaRenomeiaBaixaExcluiERestauraUmArquivoReal() throws Exception {
        UUID id = guardar("Orçamento.pdf", PDF);
        JsonNode lista = corpo(chamar("GET", ROTA + "?pasta=catalogos&tipo=PDF&busca=vidro&ordem=nome&tamanho=1", null, null), 200);
        assertThat(lista.path("total").asInt()).isEqualTo(1);
        assertThat(lista.path("contagemPorPasta").path("catalogos").asInt()).isEqualTo(1);
        assertThat(lista.path("itens").path(0).path("id").asText()).isEqualTo(id.toString());
        assertThat(lista.path("usadoBytes").asInt()).isEqualTo(PDF.length);
        assertThat(lista.path("limiteBytes").asLong()).isEqualTo(QUOTA);
        assertThat(lista.path("itens").path(0).has("url")).isFalse();

        String arquivo = ROTA + "/" + id;
        corpo(chamar("PATCH", arquivo, "application/json", """
                {"nome":"Novo.exe","pasta":"orcamentos","descricao":"Compra"}
                """.getBytes(StandardCharsets.UTF_8)), 400);
        JsonNode editado = corpo(chamar("PATCH", arquivo, "application/json", """
                {"nome":"Novo orçamento.pdf","pasta":"orcamentos","descricao":"Compra"}
                """.getBytes(StandardCharsets.UTF_8)), 200);
        assertThat(editado.path("nome").asText()).isEqualTo("Novo orçamento.pdf");
        assertThat(editado.path("pasta").asText()).isEqualTo("orcamentos");

        var download = chamar("GET", arquivo + "/download", null, null);
        assertThat(download.statusCode()).isEqualTo(200);
        assertThat(download.body()).isEqualTo(PDF);
        assertThat(download.headers().firstValue("Content-Disposition")).hasValueSatisfying(
                valor -> assertThat(valor).startsWith("attachment").contains("filename*="));
        assertThat(download.headers().firstValue("Cache-Control")).hasValue("no-store");
        assertThat(download.headers().firstValue("X-Content-Type-Options")).hasValue("nosniff");
        corpo(chamar("GET", arquivo + "/preview", null, null), 404);

        assertThat(chamar("DELETE", arquivo, null, null).statusCode()).isEqualTo(204);
        corpo(chamar("GET", arquivo + "/download", null, null), 404);
        assertThat(corpo(chamar("POST", arquivo + "/restaurar", null, null), 200).path("id").asText())
                .isEqualTo(id.toString());
        assertThat(chamar("GET", arquivo + "/download", null, null).body()).isEqualTo(PDF);
    }

    @Test void visualizacaoAutenticadaEExpurgoAposJanelaDeRestauracao() throws Exception {
        byte[] png = imagem();
        UUID id = guardar("Foto.png", png);
        String arquivo = ROTA + "/" + id;
        String referencia = db.queryForObject("SELECT url FROM arquivo_banco WHERE id=?", String.class, id);

        var preview = chamar("GET", arquivo + "/preview", null, null);
        assertThat(preview.statusCode()).isEqualTo(200);
        assertThat(preview.body()).isEqualTo(png);
        assertThat(preview.headers().firstValue("Content-Type")).hasValue("image/png");
        assertThat(preview.headers().firstValue("Content-Disposition")).hasValueSatisfying(
                valor -> assertThat(valor).startsWith("inline"));
        assertThat(preview.headers().firstValue("Content-Security-Policy")).hasValueSatisfying(
                valor -> assertThat(valor).contains("sandbox"));
        HttpRequest semToken = HttpRequest.newBuilder(url(arquivo + "/preview")).GET().build();
        assertThat(http.send(semToken, HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(401);

        assertThat(chamar("DELETE", arquivo, null, null).statusCode()).isEqualTo(204);
        assertThat(corpo(chamar("GET", ROTA, null, null), 200).path("usadoBytes").asInt()).isEqualTo(png.length);
        db.update("UPDATE arquivo_banco SET exclusao_expira_em=now()-interval '1 minute' WHERE id=?", id);
        corpo(chamar("POST", arquivo + "/restaurar", null, null), 404);
        ReflectionTestUtils.invokeMethod(contexto.getBean("expurgoBancoArquivosJob"), "limpar");
        assertThat(storage.foiRemovida(referencia)).isTrue();
        assertThat(db.queryForObject("SELECT count(*) FROM arquivo_banco WHERE id=?", Integer.class, id)).isZero();
        assertThat(corpo(chamar("GET", ROTA, null, null), 200).path("usadoBytes").asInt()).isZero();
    }

    @Test void rejeitaConteudoFalsoEAtingimentoDaQuotaSemGravarNoStorage() throws Exception {
        int objetosAntes = storage.contagemDeObjetos();
        corpo(upload("Nome.pdf", "<html>teste</html>".getBytes(StandardCharsets.UTF_8)), 415);
        UUID ocupado = UUID.randomUUID();
        criados.add(ocupado);
        db.update("""
                INSERT INTO arquivo_banco (id,nome,pasta,tipo,mime_type,tamanho_bytes,url)
                VALUES (?,'ocupado.pdf','catalogos','PDF','application/pdf',?,'fixture/teste-quota')
                """, ocupado, QUOTA);
        assertThat(corpo(upload("Valido.pdf", PDF), 409).path("codigo").asText()).isEqualTo("BANCO_ARQUIVOS_QUOTA");
        assertThat(storage.contagemDeObjetos()).isEqualTo(objetosAntes);
    }

    private UUID guardar(String nome, byte[] bytes) throws Exception {
        JsonNode dados = corpo(upload(nome, bytes), 201);
        UUID id = UUID.fromString(dados.path("id").asText());
        criados.add(id);
        assertThat(dados.path("nome").asText()).isEqualTo(nome);
        assertThat(dados.has("referencia")).isFalse();
        return id;
    }

    private HttpResponse<byte[]> upload(String nome, byte[] bytes) throws Exception {
        String boundary = "synapse-" + UUID.randomUUID();
        try (var corpo = new ByteArrayOutputStream()) {
            corpo.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"pasta\"\r\n\r\ncatalogos\r\n"
                    + "--" + boundary + "\r\nContent-Disposition: form-data; name=\"descricao\"\r\n\r\nMostruário de vidro\r\n"
                    + "--" + boundary + "\r\nContent-Disposition: form-data; name=\"arquivo\"; filename=\"" + nome
                    + "\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            corpo.write(bytes);
            corpo.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            return chamar("POST", ROTA, "multipart/form-data; boundary=" + boundary, corpo.toByteArray());
        }
    }

    private HttpResponse<byte[]> chamar(String metodo, String caminho, String contentType, byte[] corpo)
            throws IOException, InterruptedException {
        var requisicao = HttpRequest.newBuilder(url(caminho)).timeout(Duration.ofSeconds(20))
                .header("Authorization", "Bearer " + token);
        if (contentType != null) {
            requisicao.header("Content-Type", contentType);
        }
        requisicao.method(metodo, corpo == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(corpo));
        return http.send(requisicao.build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    private URI url(String caminho) {
        return URI.create("http://localhost:" + porta + caminho);
    }

    private JsonNode corpo(HttpResponse<byte[]> resposta, int status) throws IOException {
        assertThat(resposta.statusCode()).as(new String(resposta.body(), StandardCharsets.UTF_8)).isEqualTo(status);
        return json.readTree(resposta.body());
    }

    private static byte[] imagem() throws IOException {
        try (var bytes = new ByteArrayOutputStream()) {
            ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", bytes);
            return bytes.toByteArray();
        }
    }
}
