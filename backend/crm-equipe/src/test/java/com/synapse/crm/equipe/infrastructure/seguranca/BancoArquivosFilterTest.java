package com.synapse.crm.equipe.infrastructure.seguranca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import jakarta.servlet.FilterChain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.util.unit.DataSize;

import com.synapse.crm.equipe.infrastructure.seguranca.LimiteDistribuidoDoBanco.Categoria;
import com.synapse.crm.equipe.infrastructure.seguranca.LimitesDeRequisicoesDoBancoProperties.Cota;
import com.synapse.crm.sharedkernel.identidade.PapelUsuario;
import com.synapse.crm.sharedkernel.identidade.UsuarioAutenticado;
import com.synapse.crm.sharedkernel.identidade.UsuarioContext;
import com.synapse.crm.sharedkernel.permissao.VerificadorDeCapacidades;

class BancoArquivosFilterTest {
    private static final String BASE = "/api/v1/banco-arquivos";
    private static final UUID USUARIO_ID = UUID.randomUUID();
    private static final long TETO_UPLOAD = DataSize.ofMegabytes(26).toBytes();
    private static final Cota COTA = new Cota(3, 6);
    private static final LimitesDeRequisicoesDoBancoProperties PROPRIEDADES = new LimitesDeRequisicoesDoBancoProperties(
            Duration.ofMinutes(1), Duration.ofMillis(500), 2, 8, DataSize.ofMegabytes(26), DataSize.ofKilobytes(16),
            1, 1, 1, COTA, COTA, COTA, COTA);

    private final UsuarioContext usuario = mock(UsuarioContext.class);
    private final VerificadorDeCapacidades capacidades = mock(VerificadorDeCapacidades.class);
    private final LimiteDistribuidoDoBanco limite = mock(LimiteDistribuidoDoBanco.class);
    private final FilterChain cadeia = mock(FilterChain.class);
    private final BancoArquivosFilter filtro = new BancoArquivosFilter(
            usuario, capacidades, limite, PROPRIEDADES, Jackson2ObjectMapperBuilder.json().build());

    @ParameterizedTest
    @CsvSource(textBlock = """
            GET, '', LEITURA, ver
            GET, /arquivo, LEITURA, ver
            HEAD, /arquivo/preview, DOWNLOAD, ver
            GET, /arquivo/download, DOWNLOAD, ver
            POST, '', UPLOAD, criar
            PATCH, /arquivo, ESCRITA, editar
            DELETE, /arquivo, ESCRITA, excluir
            POST, /arquivo/restaurar, ESCRITA, excluir
            POST, /arquivo/enviar, ESCRITA, enviar
            """)
    void cadaOperacaoExigeCapacidadeECotaProprias(String metodo, String sufixo, Categoria categoria, String acao)
            throws Exception {
        permitir(acao);
        when(limite.aguardar(USUARIO_ID, categoria)).thenReturn(Duration.ZERO);
        var requisicao = requisicao(metodo, BASE + sufixo, 20);
        var resposta = new MockHttpServletResponse();

        filtro.doFilter(requisicao, resposta, cadeia);

        verify(capacidades).permite("banco_arquivos." + acao);
        verify(limite).aguardar(USUARIO_ID, categoria);
        verify(cadeia).doFilter(requisicao, resposta);
    }

    @Test
    void negaUploadSemCapacidadeAntesDaCotaEParsing() throws Exception {
        autenticar();
        var requisicao = requisicao("POST", BASE, 100);
        requisicao.setContentType(MediaType.MULTIPART_FORM_DATA_VALUE);
        var resposta = new MockHttpServletResponse();

        filtro.doFilter(requisicao, resposta, cadeia);

        assertThat(resposta.getStatus()).isEqualTo(403);
        verifyNoInteractions(limite, cadeia);
    }

    @ParameterizedTest
    @CsvSource({"-1, 411", "27262977, 413"})
    void negaUploadSemTamanhoOuAcimaDoTetoAntesDoParsing(long tamanho, int status) throws Exception {
        permitir("criar");
        var requisicao = requisicao("POST", BASE, tamanho);
        requisicao.setContentType(MediaType.MULTIPART_FORM_DATA_VALUE);
        var resposta = new MockHttpServletResponse();

        filtro.doFilter(requisicao, resposta, cadeia);

        assertThat(resposta.getStatus()).isEqualTo(status);
        verifyNoInteractions(limite, cadeia);
    }

    @Test
    void negaMultipartEmEnvioParaImpedirUsoDoParserForaDoUpload() throws Exception {
        permitir("enviar");
        var requisicao = requisicao("POST", BASE + "/arquivo/enviar", TETO_UPLOAD);
        requisicao.setContentType(MediaType.MULTIPART_FORM_DATA_VALUE);
        var resposta = new MockHttpServletResponse();

        filtro.doFilter(requisicao, resposta, cadeia);

        assertThat(resposta.getStatus()).isEqualTo(415);
        verifyNoInteractions(limite, cadeia);
    }

    @Test
    void cotaEsgotadaResponde429ComRetryAfterAntesDoUpload() throws Exception {
        permitir("criar");
        when(limite.aguardar(USUARIO_ID, Categoria.UPLOAD)).thenReturn(Duration.ofMillis(1_001));
        var requisicao = requisicao("POST", BASE, TETO_UPLOAD);
        requisicao.setContentType(MediaType.MULTIPART_FORM_DATA_VALUE);
        var resposta = new MockHttpServletResponse();

        filtro.doFilter(requisicao, resposta, cadeia);

        assertThat(resposta.getStatus()).isEqualTo(429);
        assertThat(resposta.getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("2");
        assertThat(resposta.getContentAsString()).contains("BANCO_ARQUIVOS_LIMITE");
        verifyNoInteractions(cadeia);
    }

    @Test
    void rotaCodificadaTambemPassaPeloLimite() throws Exception {
        permitir("ver");
        when(limite.aguardar(USUARIO_ID, Categoria.DOWNLOAD)).thenReturn(Duration.ofSeconds(1));
        var requisicao = requisicao("GET", "/api/v1/banco-%61rquivos/arquivo/do%77nload", -1);
        var resposta = new MockHttpServletResponse();

        filtro.doFilter(requisicao, resposta, cadeia);

        assertThat(resposta.getStatus()).isEqualTo(429);
        verifyNoInteractions(cadeia);
    }

    @Test
    void faltaDeRedisRecusaBancoMasNaoAfetaAtendimentos() throws Exception {
        permitir("ver");
        when(limite.aguardar(USUARIO_ID, Categoria.LEITURA)).thenThrow(new QueryTimeoutException("timeout"));
        var listar = requisicao("GET", BASE, -1);
        var resposta = new MockHttpServletResponse();
        filtro.doFilter(listar, resposta, cadeia);
        assertThat(resposta.getStatus()).isEqualTo(503);
        assertThat(resposta.getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("60");
        verifyNoInteractions(cadeia);

        var chat = requisicao("POST", "/api/v1/atendimentos/atendimento/mensagens/midia", TETO_UPLOAD);
        var respostaChat = new MockHttpServletResponse();
        filtro.doFilter(chat, respostaChat, cadeia);
        verify(cadeia).doFilter(chat, respostaChat);
    }

    @Test
    void limitaUploadsEmProgressoELiberaMesmoSeACadeiaFalhar() throws Exception {
        permitir("criar");
        when(limite.aguardar(USUARIO_ID, Categoria.UPLOAD)).thenReturn(Duration.ZERO);
        var terceiro = requisicao("POST", BASE, 1);
        var respostaDepois = new MockHttpServletResponse();

        assertThatThrownBy(() -> filtro.doFilter(requisicao("POST", BASE, 1), new MockHttpServletResponse(), (req, res) -> {
            var ocupada = new MockHttpServletResponse();
            filtro.doFilter(requisicao("POST", BASE, 1), ocupada, cadeia);
            assertThat(ocupada.getStatus()).isEqualTo(503);
            assertThat(ocupada.getContentAsString()).contains("BANCO_ARQUIVOS_OCUPADO");
            verifyNoInteractions(cadeia);
            throw new IOException("upload interrompido");
        })).isInstanceOf(IOException.class);

        filtro.doFilter(terceiro, respostaDepois, cadeia);
        verify(cadeia).doFilter(terceiro, respostaDepois);
    }

    private void autenticar() {
        when(usuario.atualSeHouver()).thenReturn(Optional.of(new UsuarioAutenticado(USUARIO_ID, PapelUsuario.GESTOR, false)));
    }

    private void permitir(String acao) {
        autenticar();
        when(capacidades.permite("banco_arquivos." + acao)).thenReturn(true);
    }

    private MockHttpServletRequest requisicao(String metodo, String caminho, long tamanho) {
        return new MockHttpServletRequest(metodo, caminho) {
            @Override
            public long getContentLengthLong() {
                return tamanho;
            }
        };
    }
}
