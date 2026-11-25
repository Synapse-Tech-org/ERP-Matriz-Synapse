package com.synapse.crm.equipe.infrastructure.seguranca;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.Semaphore;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.bulkhead.BulkheadFullException;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.server.PathContainer;
import org.springframework.http.server.RequestPath;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import com.synapse.crm.equipe.domain.permissao.Capacidade;
import com.synapse.crm.equipe.infrastructure.seguranca.LimiteDistribuidoDoBanco.Categoria;
import com.synapse.crm.sharedkernel.identidade.UsuarioContext;
import com.synapse.crm.sharedkernel.permissao.VerificadorDeCapacidades;

/** Protege o Banco de Arquivos após a autenticação e antes da resolução multipart do MVC. */
class BancoArquivosFilter extends OncePerRequestFilter {

    private static final String BASE = "/api/v1/banco-arquivos";
    private static final String ARQUIVO = "/{id:[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}}";
    private static final PathPattern PREFIXO = PathPatternParser.defaultInstance.parse(BASE + "/{*subcaminho}");

    private final UsuarioContext usuario;
    private final VerificadorDeCapacidades capacidades;
    private final LimiteDistribuidoDoBanco limite;
    private final LimitesDeRequisicoesDoBancoProperties propriedades;
    private final ObjectMapper json;
    private final Semaphore uploads;
    private final Semaphore downloads;
    private final Semaphore miniaturas;
    private final Semaphore envios;

    BancoArquivosFilter(
            UsuarioContext usuario,
            VerificadorDeCapacidades capacidades,
            LimiteDistribuidoDoBanco limite,
            LimitesDeRequisicoesDoBancoProperties propriedades,
            ObjectMapper json) {
        this.usuario = usuario;
        this.capacidades = capacidades;
        this.limite = limite;
        this.propriedades = propriedades;
        this.json = json;
        this.uploads = new Semaphore(propriedades.uploadsSimultaneos());
        this.downloads = new Semaphore(propriedades.downloadsSimultaneos());
        this.miniaturas = new Semaphore(propriedades.miniaturasSimultaneas());
        this.envios = new Semaphore(propriedades.enviosSimultaneos());
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest requisicao) {
        return "OPTIONS".equals(requisicao.getMethod()) || !PREFIXO.matches(caminho(requisicao));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest requisicao, HttpServletResponse resposta, FilterChain cadeia)
            throws ServletException, IOException {
        var ator = usuario.atualSeHouver();
        if (ator.isEmpty()) {
            problema(resposta, HttpStatus.UNAUTHORIZED, "BANCO_ARQUIVOS_SEM_SESSAO", "Entre no CRM para continuar.", 0);
            return;
        }
        Operacao operacao = Operacao.resolver(requisicao.getMethod(), caminho(requisicao));
        if (operacao == null) {
            problema(resposta, HttpStatus.NOT_FOUND, "BANCO_ARQUIVOS_ROTA", "Operação do Banco de Arquivos inexistente.", 0);
            return;
        }
        if (!capacidades.permite(operacao.capacidade.id())) {
            problema(resposta, HttpStatus.FORBIDDEN, "BANCO_ARQUIVOS_SEM_ACESSO", "Seu perfil não permite esta operação.", 0);
            return;
        }
        if (!validarCorpo(requisicao, resposta, operacao)) {
            return;
        }
        Semaphore concorrencia = switch (operacao) {
            case CRIAR -> uploads;
            case DOWNLOAD, PREVER -> downloads;
            case MINIATURA -> miniaturas;
            case ENVIAR -> envios;
            default -> null;
        };
        if (concorrencia != null && !concorrencia.tryAcquire()) {
            problema(resposta, HttpStatus.SERVICE_UNAVAILABLE, "BANCO_ARQUIVOS_OCUPADO",
                    "O Banco de Arquivos está processando outras requisições. Tente novamente em instantes.", 1);
            return;
        }
        try {
            if (consumirCota(resposta, ator.orElseThrow().id(), operacao.categoria)) {
                cadeia.doFilter(requisicao, resposta);
            }
        } finally {
            if (concorrencia != null) concorrencia.release();
        }
    }

    private boolean consumirCota(HttpServletResponse resposta, UUID usuarioId, Categoria categoria)
            throws IOException {
        Duration espera;
        try {
            espera = limite.aguardar(usuarioId, categoria);
        } catch (DataAccessException | CallNotPermittedException | BulkheadFullException e) {
            problema(resposta, HttpStatus.SERVICE_UNAVAILABLE, "BANCO_ARQUIVOS_LIMITE_INDISPONIVEL",
                    "O Banco de Arquivos está temporariamente indisponível.", propriedades.janela().toSeconds());
            return false;
        }
        if (!espera.isZero()) {
            long segundos = espera.toSeconds() + (espera.getNano() == 0 ? 0 : 1);
            problema(resposta, HttpStatus.TOO_MANY_REQUESTS, "BANCO_ARQUIVOS_LIMITE",
                    "Limite de requisições atingido. Aguarde para tentar novamente.", segundos);
            return false;
        }
        return true;
    }

    private boolean validarCorpo(HttpServletRequest requisicao, HttpServletResponse resposta, Operacao operacao)
            throws IOException {
        if (operacao != Operacao.CRIAR && StringUtils.startsWithIgnoreCase(requisicao.getContentType(), "multipart/")) {
            problema(resposta, HttpStatus.UNSUPPORTED_MEDIA_TYPE, "BANCO_ARQUIVOS_TIPO_CORPO",
                    "Esta operação não recebe um upload.", 0);
            return false;
        }
        if (operacao.tamanho == TamanhoCorpo.SEM_CORPO) return true;

        long tamanho = requisicao.getContentLengthLong();
        if (tamanho < 0) {
            problema(resposta, HttpStatus.LENGTH_REQUIRED, "BANCO_ARQUIVOS_TAMANHO_OBRIGATORIO",
                    "Informe o tamanho da requisição no cabeçalho Content-Length.", 0);
            return false;
        }
        long teto = (operacao.tamanho == TamanhoCorpo.UPLOAD ? propriedades.tamanhoUpload() : propriedades.tamanhoJson())
                .toBytes();
        if (tamanho > teto) {
            problema(resposta, HttpStatus.PAYLOAD_TOO_LARGE, "BANCO_ARQUIVOS_CORPO_MUITO_GRANDE",
                    "O tamanho da requisição ultrapassa o limite do Banco de Arquivos.", 0);
            return false;
        }
        return true;
    }

    private void problema(HttpServletResponse resposta, HttpStatus status, String codigo, String detalhe, long segundos)
            throws IOException {
        ProblemDetail problema = ProblemDetail.forStatusAndDetail(status, detalhe);
        problema.setType(URI.create("urn:synapse:" + codigo));
        problema.setProperty("codigo", codigo);
        if (segundos > 0) {
            resposta.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(segundos));
            problema.setProperty("retryAfter", segundos);
        }
        resposta.setStatus(status.value());
        resposta.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        json.writeValue(resposta.getOutputStream(), problema);
    }

    private static PathContainer caminho(HttpServletRequest requisicao) {
        return RequestPath.parse(requisicao.getRequestURI(), requisicao.getContextPath()).pathWithinApplication();
    }

    private enum TamanhoCorpo {
        SEM_CORPO,
        JSON,
        UPLOAD
    }

    private enum Operacao {
        LISTAR("GET", "", Categoria.LEITURA, Capacidade.BANCO_ARQUIVOS_VER, TamanhoCorpo.SEM_CORPO),
        LISTAR_PASTAS("GET", "/pastas", Categoria.LEITURA, Capacidade.BANCO_ARQUIVOS_VER, TamanhoCorpo.SEM_CORPO),
        DETALHAR("GET", ARQUIVO, Categoria.LEITURA, Capacidade.BANCO_ARQUIVOS_VER, TamanhoCorpo.SEM_CORPO),
        DOWNLOAD("GET", ARQUIVO + "/download", Categoria.DOWNLOAD, Capacidade.BANCO_ARQUIVOS_VER, TamanhoCorpo.SEM_CORPO),
        PREVER("GET", ARQUIVO + "/preview", Categoria.DOWNLOAD, Capacidade.BANCO_ARQUIVOS_VER, TamanhoCorpo.SEM_CORPO),
        MINIATURA("GET", ARQUIVO + "/miniatura", Categoria.MINIATURA, Capacidade.BANCO_ARQUIVOS_VER, TamanhoCorpo.SEM_CORPO),
        CRIAR("POST", "", Categoria.UPLOAD, Capacidade.BANCO_ARQUIVOS_CRIAR, TamanhoCorpo.UPLOAD),
        CRIAR_PASTA("POST", "/pastas", Categoria.ESCRITA, Capacidade.BANCO_ARQUIVOS_GERENCIAR_PASTAS, TamanhoCorpo.JSON),
        RENOMEAR_PASTA("PATCH", "/pastas/{id}", Categoria.ESCRITA,
                Capacidade.BANCO_ARQUIVOS_GERENCIAR_PASTAS, TamanhoCorpo.JSON),
        EDITAR("PATCH", ARQUIVO, Categoria.ESCRITA, Capacidade.BANCO_ARQUIVOS_EDITAR, TamanhoCorpo.JSON),
        MOVER("PATCH", ARQUIVO + "/pasta", Categoria.ESCRITA, Capacidade.BANCO_ARQUIVOS_EDITAR, TamanhoCorpo.JSON),
        EXCLUIR("DELETE", ARQUIVO, Categoria.ESCRITA, Capacidade.BANCO_ARQUIVOS_EXCLUIR, TamanhoCorpo.SEM_CORPO),
        RESTAURAR("POST", ARQUIVO + "/restaurar", Categoria.ESCRITA, Capacidade.BANCO_ARQUIVOS_EXCLUIR, TamanhoCorpo.SEM_CORPO),
        ENVIAR("POST", ARQUIVO + "/enviar", Categoria.ESCRITA, Capacidade.BANCO_ARQUIVOS_ENVIAR, TamanhoCorpo.JSON);

        private final String metodo;
        private final PathPattern caminho;
        private final Categoria categoria;
        private final Capacidade capacidade;
        private final TamanhoCorpo tamanho;

        Operacao(String metodo, String sufixo, Categoria categoria, Capacidade capacidade, TamanhoCorpo tamanho) {
            this.metodo = metodo;
            this.caminho = PathPatternParser.defaultInstance.parse(BASE + sufixo);
            this.categoria = categoria;
            this.capacidade = capacidade;
            this.tamanho = tamanho;
        }

        static Operacao resolver(String metodo, PathContainer caminho) {
            String metodoDaOperacao = "HEAD".equals(metodo) ? "GET" : metodo;
            return Arrays.stream(values())
                    .filter(o -> o.metodo.equals(metodoDaOperacao) && o.caminho.matches(caminho))
                    .findFirst()
                    .orElse(null);
        }
    }
}
