package com.synapse.crm.app.arquivobanco;

import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ADMINISTRADOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ADMINISTRADOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.login;
import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
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
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
    private final List<String> pastasCriadas = new ArrayList<>();
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
        pastasCriadas.forEach(id -> db.update("DELETE FROM pasta_arquivo_banco WHERE id = ?", id));
        db.update("UPDATE feature_flag SET habilitado=? WHERE chave='banco_arquivos'", flagAnterior);
    }

    @Test void listaBuscaRenomeiaBaixaExcluiERestauraUmArquivoReal() throws Exception {
        UUID id = guardar("Orçamento.pdf", PDF);
        JsonNode lista = corpo(chamar("GET", ROTA + "?pasta=geral&tipo=PDF&busca=vidro&ordem=nome&tamanho=1", null, null), 200);
        assertThat(lista.path("total").asInt()).isEqualTo(1);
        assertThat(lista.path("contagemPorPasta").path("geral").asInt()).isEqualTo(1);
        assertThat(lista.path("itens").path(0).path("id").asText()).isEqualTo(id.toString());
        assertThat(lista.path("usadoBytes").asInt()).isEqualTo(PDF.length);
        assertThat(lista.path("limiteBytes").asLong()).isEqualTo(QUOTA);
        assertThat(lista.path("itens").path(0).has("url")).isFalse();

        String arquivo = ROTA + "/" + id;
        corpo(chamar("PATCH", arquivo, "application/json", """
                {"nome":"Novo.exe","descricao":"Compra"}
                """.getBytes(StandardCharsets.UTF_8)), 400);
        JsonNode editado = corpo(chamar("PATCH", arquivo, "application/json", """
                {"nome":"Novo orçamento.pdf","descricao":"Compra"}
                """.getBytes(StandardCharsets.UTF_8)), 200);
        assertThat(editado.path("nome").asText()).isEqualTo("Novo orçamento.pdf");
        assertThat(editado.path("pasta").asText()).isEqualTo("geral");

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
                VALUES (?,'ocupado.pdf','geral','PDF','application/pdf',?,'fixture/teste-quota')
                """, ocupado, QUOTA);
        assertThat(corpo(upload("Valido.pdf", PDF), 409).path("codigo").asText()).isEqualTo("BANCO_ARQUIVOS_QUOTA");
        assertThat(storage.contagemDeObjetos()).isEqualTo(objetosAntes);
    }

    @Test void miniaturasRasterPrivadasParaJpegPngWebpEPrimeiraPaginaPdf() throws Exception {
        var jpeg = new ByteArrayOutputStream();
        assertThat(ImageIO.write(new BufferedImage(640, 320, BufferedImage.TYPE_INT_RGB), "jpeg", jpeg)).isTrue();
        UUID idJpeg = guardar("Foto.jpg", jpeg.toByteArray());
        UUID idPng = guardar("Foto.png", imagem());
        UUID idWebp = guardar("Foto.webp", lerRecurso("/avatar/foto-grupo-128x96.webp"));
        UUID idPdf = guardar("Paginas.pdf", pdfDeDuasPaginas());
        for (UUID id : List.of(idJpeg, idPng, idWebp, idPdf)) {
            var resposta = chamar("GET", ROTA + "/" + id + "/miniatura", null, null);
            assertThat(resposta.statusCode()).isEqualTo(200);
            assertThat(resposta.headers().firstValue("Content-Type")).hasValue("image/png");
            assertThat(resposta.headers().firstValue("Cache-Control")).hasValueSatisfying(
                    valor -> assertThat(valor).contains("private", "no-cache"));
            assertThat(resposta.headers().firstValue("X-Content-Type-Options")).hasValue("nosniff");
            assertThat(resposta.headers().firstValue("Content-Security-Policy")).hasValueSatisfying(
                    valor -> assertThat(valor).contains("sandbox"));
            BufferedImage imagem = ImageIO.read(new ByteArrayInputStream(resposta.body()));
            assertThat(imagem).isNotNull();
            assertThat(Math.max(imagem.getWidth(), imagem.getHeight())).isBetween(1, 320);
            if (id.equals(idPdf)) {
                assertThat(imagem.getRGB(imagem.getWidth() / 2, imagem.getHeight() / 2)).isEqualTo(Color.RED.getRGB());
            }
        }

        String rotaPdf = ROTA + "/" + idPdf;
        var semToken = HttpRequest.newBuilder(url(rotaPdf + "/miniatura")).GET().build();
        assertThat(http.send(semToken, HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(401);
        assertThat(chamar("DELETE", rotaPdf, null, null).statusCode()).isEqualTo(204);
        corpo(chamar("GET", rotaPdf + "/miniatura", null, null), 404);

        UUID invalido = guardar("SemPrevia.pdf", PDF);
        var semPrevia = chamar("GET", ROTA + "/" + invalido + "/miniatura", null, null);
        assertThat(semPrevia.statusCode()).isEqualTo(204);
        assertThat(semPrevia.body()).isEmpty();
        assertThat(semPrevia.headers().firstValue("Cache-Control")).hasValue("no-store");
    }

    private static byte[] pdfDeDuasPaginas() throws IOException {
        try (var pdf = new PDDocument(); var saida = new ByteArrayOutputStream()) {
            for (Color cor : List.of(Color.RED, Color.BLUE)) {
                var pagina = new PDPage(new PDRectangle(320, 160));
                pdf.addPage(pagina);
                try (var conteudo = new PDPageContentStream(pdf, pagina)) {
                    conteudo.setNonStrokingColor(cor);
                    conteudo.addRect(0, 0, 320, 160);
                    conteudo.fill();
                }
            }
            pdf.save(saida);
            return saida.toByteArray();
        }
    }

    @Test void organizaArquivosEmPastasDinamicasMantendoGeralProtegida() throws Exception {
        String rotasDasPastas = ROTA + "/pastas";
        JsonNode pastas = corpo(chamar("GET", rotasDasPastas, null, null), 200);
        assertThat(pastas.size()).isEqualTo(1);
        assertThat(pastas.path(0)).isEqualTo(json.readTree("""
                {"id":"geral","nome":"Geral","geral":true}
                """));
        JsonNode primeira = enviarJson("POST", rotasDasPastas, "{\"nome\":\"  Clientes  \"}", 201);
        String destino = primeira.path("id").asText();
        pastasCriadas.add(destino);
        assertThat(primeira.path("nome").asText()).isEqualTo("Clientes");
        assertThat(primeira.path("geral").asBoolean()).isFalse();
        enviarJson("POST", rotasDasPastas, "{\"nome\":\"clientes\"}", 409);
        enviarJson("POST", rotasDasPastas, "{\"nome\":\"geraL\"}", 409);
        enviarJson("POST", rotasDasPastas, "{\"nome\":\"pasta/subpasta\"}", 400);
        enviarJson("PATCH", rotasDasPastas + "/geral", "{\"nome\":\"Outra\"}", 409);

        UUID arquivo = guardar("pedido.pdf", PDF);
        String rotaDoArquivo = ROTA + "/" + arquivo;
        enviarJson("PATCH", rotaDoArquivo + "/pasta", "{\"pasta\":\"" + UUID.randomUUID() + "\"}", 404);
        JsonNode movido = enviarJson("PATCH", rotaDoArquivo + "/pasta", "{\"pasta\":\"" + destino + "\"}", 200);
        assertThat(movido.path("pasta").asText()).isEqualTo(destino);
        assertThat(movido.path("descricao").asText()).contains("de vidro");
        assertThat(movido.path("nome").asText()).isEqualTo("pedido.pdf");
        JsonNode editado = enviarJson("PATCH", rotaDoArquivo, "{\"nome\":\"editado.pdf\",\"descricao\":\"Compra\"}", 200);
        assertThat(editado.path("pasta").asText()).isEqualTo(destino);
        var renomeada = enviarJson("PATCH", rotasDasPastas + "/" + destino, "{\"nome\":\"Pedidos\"}", 200);
        assertThat(renomeada.path("id").asText()).isEqualTo(destino);
        assertThat(renomeada.path("nome").asText()).isEqualTo("Pedidos");
        JsonNode lista = corpo(chamar("GET", ROTA + "?pasta=" + destino, null, null), 200);
        assertThat(lista.path("contagemPorPasta").path(destino).asInt()).isEqualTo(1);
        assertThat(lista.path("itens").path(0).path("id").asText()).isEqualTo(arquivo.toString());
        assertThat(enviarJson("PATCH", rotaDoArquivo + "/pasta", "{\"pasta\":\"geral\"}", 200)
                .path("pasta").asText()).isEqualTo("geral");
        assertThat(chamar("DELETE", rotaDoArquivo, null, null).statusCode()).isEqualTo(204);
        enviarJson("PATCH", rotaDoArquivo + "/pasta", "{\"pasta\":\"geral\"}", 404);
    }

    private JsonNode enviarJson(String metodo, String caminho, String dados, int status) throws Exception {
        return corpo(chamar(metodo, caminho, "application/json", dados.getBytes(StandardCharsets.UTF_8)), status);
    }

    @ParameterizedTest
    @CsvSource({
            "slides.doc,/word/vazio.doc,DOC,application/msword",
            "pasta.docx,/word/sintetico.docx,DOCX,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "nota.ogg,/z-api/audio-sintetico.ogg,AUDIO,audio/ogg",
            "video.mp4,/midia/chat-interno/video-validacao.mp4,VIDEO,video/mp4",
            "foto.webp,/avatar/foto-grupo-128x96.webp,IMAGEM,image/webp"
    })
    void publicaNovosFormatosNoFiltroCorrespondenteComMimeCanonico(
            String nome, String recurso, String tipo, String mime) throws Exception {
        byte[] real = lerRecurso(recurso);
        UUID id = guardar(nome, real);
        String arquivo = ROTA + "/" + id;
        JsonNode lista = corpo(chamar("GET", ROTA + "?tipo=" + tipo, null, null), 200);
        JsonNode item = lista.path("itens").get(0);
        assertThat(item.path("id").asText()).isEqualTo(id.toString());
        assertThat(item.path("tipo").asText()).isEqualTo(tipo);
        assertThat(item.path("mimeType").asText()).isEqualTo(mime);

        var previa = chamar("GET", arquivo + "/preview", null, null);
        if ("image/webp".equals(mime)) {
            assertThat(previa.statusCode()).isEqualTo(200);
            assertThat(previa.headers().firstValue("Content-Type")).hasValue(mime);
            assertThat(previa.body()).isEqualTo(real);
        } else {
            assertThat(previa.statusCode()).isEqualTo(404);
        }
        var download = chamar("GET", arquivo + "/download", null, null);
        assertThat(download.statusCode()).isEqualTo(200);
        assertThat(download.headers().firstValue("Content-Type")).hasValue(mime);
        assertThat(download.body()).isEqualTo(real);
    }

    @Test void recusaVideoRenomeadoParaM4aOuEmbaladoComMimeIncoerente() throws Exception {
        byte[] video = lerRecurso("/midia/chat-interno/video-validacao.mp4");
        corpo(upload("audio.m4a", video), 415);
        corpo(upload("audio.mp3", video), 415);
        corpo(upload("foto.webp", video), 415);
    }

    @Test void aceitaTextoPuroERecusaImagemWebpComDimensoesExcessivas() throws Exception {
        byte[] texto = "Medidas de corte\nLargura 2,5 metros.".getBytes(StandardCharsets.UTF_8);
        UUID id = guardar("medidas.txt", texto);
        JsonNode dados = corpo(chamar("GET", ROTA + "/" + id, null, null), 200);
        assertThat(dados.path("tipo").asText()).isEqualTo("TXT");
        assertThat(dados.path("mimeType").asText()).isEqualTo("text/plain");

        byte[] webp = lerRecurso("/avatar/foto-grupo-128x96.webp");
        // O cabeçalho VP8L guarda largura e altura de 14 bits. 16384 × 16384 ultrapassa a cota de pixels.
        webp[21] = (byte) 0xff;
        webp[22] = (byte) 0xff;
        webp[23] = (byte) 0xff;
        webp[24] = 0x0f;
        corpo(upload("enorme.webp", webp), 415);
    }

    private byte[] lerRecurso(String nome) throws IOException {
        try (var arquivo = getClass().getResourceAsStream(nome)) {
            assertThat(arquivo).as(nome).isNotNull();
            return arquivo.readAllBytes();
        }
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
            corpo.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"descricao\"\r\n\r\nMostruário de vidro\r\n"
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
