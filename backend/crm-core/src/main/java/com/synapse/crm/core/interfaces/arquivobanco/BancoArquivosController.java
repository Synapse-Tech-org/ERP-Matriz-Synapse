package com.synapse.crm.core.interfaces.arquivobanco;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import jakarta.servlet.http.HttpServletResponse;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.synapse.crm.core.application.arquivobanco.AbrirArquivoBancoUseCase;
import com.synapse.crm.core.application.arquivobanco.AbrirArquivoBancoUseCase.ArquivoAberto;
import com.synapse.crm.core.application.arquivobanco.ArquivoBancoRepositorio.Ordem;
import com.synapse.crm.core.application.arquivobanco.EditarArquivoBancoUseCase;
import com.synapse.crm.core.application.arquivobanco.EnviarArquivoBancoUseCase;
import com.synapse.crm.core.application.arquivobanco.ExcluirArquivoBancoUseCase;
import com.synapse.crm.core.application.arquivobanco.ListarArquivosBancoUseCase;
import com.synapse.crm.core.application.arquivobanco.ObterArquivoBancoUseCase;
import com.synapse.crm.core.application.arquivobanco.RestaurarArquivoBancoUseCase;
import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;
import com.synapse.crm.core.domain.arquivobanco.TipoArquivoBanco;

@RestController
@RequestMapping("/api/v1/banco-arquivos")
@Tag(name = "Banco de Arquivos", description = "Biblioteca privada de materiais da equipe.")
@SecurityRequirement(name = "bearerAuth")
class BancoArquivosController {
    private final ListarArquivosBancoUseCase listar;
    private final ObterArquivoBancoUseCase obter;
    private final AbrirArquivoBancoUseCase abrir;
    private final EnviarArquivoBancoUseCase enviar;
    private final EditarArquivoBancoUseCase editar;
    private final ExcluirArquivoBancoUseCase excluir;
    private final RestaurarArquivoBancoUseCase restaurar;

    BancoArquivosController(ListarArquivosBancoUseCase listar, ObterArquivoBancoUseCase obter,
            AbrirArquivoBancoUseCase abrir, EnviarArquivoBancoUseCase enviar, EditarArquivoBancoUseCase editar,
            ExcluirArquivoBancoUseCase excluir, RestaurarArquivoBancoUseCase restaurar) {
        this.listar = listar;
        this.obter = obter;
        this.abrir = abrir;
        this.enviar = enviar;
        this.editar = editar;
        this.excluir = excluir;
        this.restaurar = restaurar;
    }

    @GetMapping
    ListarArquivosBancoUseCase.Resultado listar(
            @RequestParam(required = false) String pasta, @RequestParam(required = false) TipoArquivoBanco tipo,
            @RequestParam(required = false) String busca, @RequestParam(defaultValue = "recentes") Ordem ordem,
            @RequestParam(defaultValue = "0") int pagina, @RequestParam(defaultValue = "24") int tamanho) {
        return listar.executar(pasta, tipo, busca, ordem, pagina, tamanho);
    }

    @GetMapping("/{id}")
    Metadados obter(@PathVariable UUID id) {
        return obter.executar(id);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    Metadados enviar(@RequestPart MultipartFile arquivo, @RequestParam String pasta,
            @RequestParam(required = false) String descricao) throws IOException {
        try (var conteudo = arquivo.getInputStream()) {
            return enviar.executar(arquivo.getOriginalFilename(), arquivo.getSize(), conteudo, pasta, descricao);
        }
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    Metadados editar(@PathVariable UUID id, @RequestBody Edicao entrada) {
        return editar.executar(id, entrada.nome(), entrada.pasta(), entrada.descricao());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void excluir(@PathVariable UUID id) {
        excluir.executar(id);
    }

    @PostMapping("/{id}/restaurar")
    Metadados restaurar(@PathVariable UUID id) {
        return restaurar.executar(id);
    }

    @GetMapping("/{id}/download")
    void download(@PathVariable UUID id, HttpServletResponse resposta) throws IOException {
        try (ArquivoAberto arquivo = abrir.paraDownload(id)) {
            responder(arquivo, resposta, ContentDisposition.attachment());
        }
    }

    @GetMapping("/{id}/preview")
    void preview(@PathVariable UUID id, HttpServletResponse resposta) throws IOException {
        try (ArquivoAberto arquivo = abrir.paraVisualizacao(id)) {
            responder(arquivo, resposta, ContentDisposition.inline());
        }
    }

    private static void responder(ArquivoAberto arquivo, HttpServletResponse resposta, ContentDisposition.Builder disposicao)
            throws IOException {
        resposta.setContentType(arquivo.mimeType());
        resposta.setContentLengthLong(arquivo.tamanhoBytes());
        resposta.setHeader(HttpHeaders.CONTENT_DISPOSITION,
                disposicao.filename(arquivo.nome(), StandardCharsets.UTF_8).build().toString());
        resposta.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        resposta.setHeader("X-Content-Type-Options", "nosniff");
        resposta.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        arquivo.conteudo().transferTo(resposta.getOutputStream());
    }

    record Edicao(String nome, String pasta, String descricao) {}
}
