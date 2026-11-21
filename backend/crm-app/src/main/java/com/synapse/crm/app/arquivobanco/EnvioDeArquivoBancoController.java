package com.synapse.crm.app.arquivobanco;

import java.io.UncheckedIOException;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.synapse.crm.atendimento.application.ChaveIdempotenciaReutilizadaException;
import com.synapse.crm.atendimento.application.RecursoDeAtendimentoIndisponivelException;
import com.synapse.crm.atendimento.application.midia.AnexoExcedeuLimiteException;
import com.synapse.crm.atendimento.application.midia.TipoDeMidiaNaoPermitidoException;
import com.synapse.crm.atendimento.domain.atendimento.AtendimentoJaFinalizadoException;
import com.synapse.crm.atendimento.domain.canal.ForaDaJanelaException;

@RestController
@RequestMapping("/api/v1/banco-arquivos")
@Tag(name = "Banco de Arquivos")
@SecurityRequirement(name = "bearerAuth")
class EnvioDeArquivoBancoController {

    private final EnviarArquivoBancoAoClienteUseCase enviar;

    EnvioDeArquivoBancoController(EnviarArquivoBancoAoClienteUseCase enviar) {
        this.enviar = enviar;
    }

    @Operation(summary = "Enfileirar um arquivo do banco no atendimento escolhido",
            description = "Respeita a visibilidade do atendimento e a janela do canal. Repita o mesmo Idempotency-Key se a resposta se perder.")
    @PostMapping(path = "/{id}/enviar", consumes = MediaType.APPLICATION_JSON_VALUE)
    EnvioResposta enviar(
            @PathVariable UUID id,
            @RequestHeader("Idempotency-Key") UUID chave,
            @Valid @RequestBody EnvioRequisicao pedido) {
        var resultado = enviar.executar(id, pedido.atendimentoId(), pedido.legenda(), chave);
        return new EnvioResposta(resultado.atendimento().id(), resultado.mensagem().id());
    }

    @ExceptionHandler(RecursoDeAtendimentoIndisponivelException.class)
    ProblemDetail atendimentoIndisponivel() {
        return problema(HttpStatus.NOT_FOUND, "Atendimento indisponível para envio.", "atendimento_indisponivel");
    }

    @ExceptionHandler({AtendimentoJaFinalizadoException.class, ChaveIdempotenciaReutilizadaException.class})
    ProblemDetail envioEmConflito() {
        return problema(HttpStatus.CONFLICT, "O envio conflita com o estado atual do atendimento.", "conflito");
    }

    @ExceptionHandler(ForaDaJanelaException.class)
    ProblemDetail janelaFechada() {
        return problema(HttpStatus.UNPROCESSABLE_ENTITY, "Atendimento fora da janela de envio do canal.", "janela_fechada");
    }

    @ExceptionHandler(TipoDeMidiaNaoPermitidoException.class)
    ProblemDetail tipoIncompativel() {
        return problema(HttpStatus.UNPROCESSABLE_ENTITY, "O canal não aceita este tipo de arquivo.", "tipo_incompativel");
    }

    @ExceptionHandler(AnexoExcedeuLimiteException.class)
    ProblemDetail arquivoGrande() {
        return problema(HttpStatus.PAYLOAD_TOO_LARGE, "O arquivo excede o limite de envio do canal.", "arquivo_grande");
    }

    @ExceptionHandler(UncheckedIOException.class)
    ProblemDetail arquivoIlegivel() {
        return problema(HttpStatus.SERVICE_UNAVAILABLE, "Não foi possível ler o arquivo.", "arquivo_ilegivel");
    }

    private static ProblemDetail problema(HttpStatus status, String detalhe, String motivo) {
        ProblemDetail problema = ProblemDetail.forStatusAndDetail(status, detalhe);
        problema.setProperty("motivo", motivo);
        return problema;
    }

    record EnvioRequisicao(@NotNull UUID atendimentoId, @Size(max = 1024) String legenda) {}

    record EnvioResposta(UUID atendimentoId, UUID mensagemId) {}
}
