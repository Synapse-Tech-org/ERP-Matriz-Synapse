package com.synapse.crm.core.interfaces.arquivobanco;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.synapse.crm.core.application.arquivobanco.FalhaArquivoBanco;

@RestControllerAdvice
class FalhasBancoArquivosAdvice {
    @ExceptionHandler(FalhaArquivoBanco.class)
    ResponseEntity<ProblemDetail> mapear(FalhaArquivoBanco erro) {
        HttpStatus status = switch (erro.motivo()) {
            case ENTRADA_INVALIDA -> HttpStatus.BAD_REQUEST;
            case FORMATO_INVALIDO -> HttpStatus.UNSUPPORTED_MEDIA_TYPE;
            case LIMITE_ARQUIVO -> HttpStatus.PAYLOAD_TOO_LARGE;
            case QUOTA -> HttpStatus.CONFLICT;
            case NAO_ENCONTRADO -> HttpStatus.NOT_FOUND;
            case INDISPONIVEL -> HttpStatus.SERVICE_UNAVAILABLE;
        };
        ProblemDetail detalhe = ProblemDetail.forStatusAndDetail(status, erro.getMessage());
        detalhe.setProperty("codigo", "BANCO_ARQUIVOS_" + erro.motivo().name());
        var resposta = ResponseEntity.status(status);
        if (status == HttpStatus.SERVICE_UNAVAILABLE) {
            resposta.header(HttpHeaders.RETRY_AFTER, "5");
        }
        return resposta.body(detalhe);
    }
}
