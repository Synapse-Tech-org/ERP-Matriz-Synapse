package com.synapse.crm.app.arquivobanco;

import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_ANA;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_BRUNO;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.EMAIL_GESTOR;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_ATENDENTE;
import static com.synapse.crm.app.seguranca.ApoioAutenticacao.SENHA_GESTOR;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.synapse.crm.app.PostgresIT;
import com.synapse.crm.app.seguranca.ApoioAutenticacao;
import com.synapse.crm.equipe.application.permissao.ResolvedorDePermissoesEfetivas;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "synapse.banco-arquivos.limites-requisicoes.leitura.usuario=1",
    "synapse.banco-arquivos.limites-requisicoes.leitura.instancia=2",
    "synapse.banco-arquivos.limites-requisicoes.upload.usuario=1",
    "synapse.banco-arquivos.limites-requisicoes.timeout-redis=3s"
})
@ActiveProfiles("dev")
class BancoArquivosSegurancaIT extends PostgresIT {
    private static final String BANCO = "/api/v1/banco-arquivos";

    @Autowired private TestRestTemplate rest;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ResolvedorDePermissoesEfetivas permissoes;
    @LocalServerPort private int porta;

    private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();

    @BeforeEach
    void habilitarBanco() {
        jdbc.update("UPDATE feature_flag SET habilitado = true WHERE chave = 'banco_arquivos'");
        await().atMost(Duration.ofSeconds(3)).until(() -> permissoes.flagsHabilitadas().contains("banco_arquivos"));
    }

    @AfterEach
    void restaurarFlag() {
        jdbc.update("UPDATE feature_flag SET habilitado = false WHERE chave = 'banco_arquivos'");
    }

    @Test
    void redisAplicaCotaPorUsuarioEInstanciaNoHttpSemInterferirNoChat() throws Exception {
        String ana = ApoioAutenticacao.login(rest, EMAIL_ANA, SENHA_ATENDENTE).accessToken();
        String bruno = ApoioAutenticacao.login(rest, EMAIL_BRUNO, SENHA_ATENDENTE).accessToken();
        String gestora = ApoioAutenticacao.login(rest, EMAIL_GESTOR, SENHA_GESTOR).accessToken();

        assertThat(chamar(requisicao(BANCO).GET()).statusCode()).isEqualTo(401);
        assertThat(chamar(comToken(BANCO, ana).GET()).statusCode()).isEqualTo(200);
        assertThatCotaEsgotada(chamar(comToken(BANCO, ana).GET()));
        assertThat(chamar(comToken(BANCO, bruno).GET()).statusCode()).isEqualTo(200);
        assertThatCotaEsgotada(chamar(comToken(BANCO, gestora).GET()));
        assertThat(chamar(comToken("/api/v1/atendimentos/contagem", ana).GET()).statusCode()).isEqualTo(200);
    }

    @Test
    void multipartComComprimentoChegaAoMvcMasUploadChunkedEInterrompidoNoFiltro() throws Exception {
        String gestora = ApoioAutenticacao.login(rest, EMAIL_GESTOR, SENHA_GESTOR).accessToken();
        String boundary = "upload-controle-it";
        String tipo = "multipart/form-data; boundary=" + boundary;
        byte[] multipart = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"ignorado\"\r\n\r\n"
                + "parte sem arquivo para provocar validação MVC\r\n--" + boundary + "--\r\n")
                .getBytes(StandardCharsets.UTF_8);

        var chunked = chamar(comToken(BANCO, gestora).header(HttpHeaders.CONTENT_TYPE, tipo)
                .POST(HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(multipart))));
        assertThat(chunked.statusCode()).isEqualTo(411);

        var normal = chamar(comToken(BANCO, gestora).header(HttpHeaders.CONTENT_TYPE, tipo)
                .POST(HttpRequest.BodyPublishers.ofByteArray(multipart)));
        assertThat(normal.statusCode()).isEqualTo(400);
        assertThat(normal.body()).doesNotContain("BANCO_ARQUIVOS_TAMANHO_OBRIGATORIO");

        assertThatCotaEsgotada(chamar(comToken(BANCO, gestora).header(HttpHeaders.CONTENT_TYPE, tipo)
                .POST(HttpRequest.BodyPublishers.ofByteArray(multipart))));
    }

    private void assertThatCotaEsgotada(HttpResponse<String> resposta) {
        assertThat(resposta.statusCode()).isEqualTo(429);
        assertThat(resposta.body()).contains("BANCO_ARQUIVOS_LIMITE", "retryAfter");
        assertThat(Integer.parseInt(resposta.headers().firstValue(HttpHeaders.RETRY_AFTER).orElseThrow()))
                .isBetween(1, 60);
    }

    private HttpRequest.Builder requisicao(String caminho) {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + porta + caminho))
                .timeout(Duration.ofSeconds(10));
    }

    private HttpRequest.Builder comToken(String caminho, String token) {
        return requisicao(caminho).header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private HttpResponse<String> chamar(HttpRequest.Builder requisicao) throws IOException, InterruptedException {
        return http.send(requisicao.build(), HttpResponse.BodyHandlers.ofString());
    }
}
