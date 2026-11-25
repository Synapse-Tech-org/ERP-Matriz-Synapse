package com.synapse.crm.equipe.interfaces;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import io.swagger.v3.oas.annotations.Operation;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.synapse.crm.equipe.application.usuario.AlterarPresencaOperacionalUseCase;
import com.synapse.crm.equipe.application.usuario.ObterPresencaOperacionalUseCase;
import com.synapse.crm.equipe.application.usuario.ValidadeDePresencaOperacionalInvalidaException;
import com.synapse.crm.equipe.domain.usuario.PresencaOperacional;

@RestController
@RequestMapping("/api/v1/usuarios/{id}/status-operacional")
class PresencaOperacionalController {
    private final ObterPresencaOperacionalUseCase obter;
    private final AlterarPresencaOperacionalUseCase alterar;
    private final ZoneId fuso;

    PresencaOperacionalController(
            ObterPresencaOperacionalUseCase obter, AlterarPresencaOperacionalUseCase alterar, ZoneId fuso) {
        this.obter = obter;
        this.alterar = alterar;
        this.fuso = fuso;
    }

    @GetMapping
    @Operation(summary = "Consultar presença efetiva e situação no rodízio")
    Resposta obter(@PathVariable UUID id) {
        return obter.executar(id).map(this::resposta).orElseThrow(PresencaOperacionalController::naoEncontrado);
    }

    @PatchMapping
    @Operation(summary = "Aplicar ajuste operacional temporário sem alterar a presença do CRM")
    Resposta alterar(@PathVariable UUID id, @Valid @RequestBody Alteracao corpo) {
        return alterar.executar(id, corpo.status(), corpo.validoAte())
                .map(this::resposta).orElseThrow(PresencaOperacionalController::naoEncontrado);
    }

    @ExceptionHandler(ValidadeDePresencaOperacionalInvalidaException.class)
    ProblemDetail validadeInvalida(ValidadeDePresencaOperacionalInvalidaException erro) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, erro.getMessage());
    }

    private static ResponseStatusException naoEncontrado() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuário não encontrado ou não gerenciável.");
    }

    private Resposta resposta(PresencaOperacional presenca) {
        return new Resposta(presenca, fuso.getId());
    }

    record Alteracao(@NotNull PresencaOperacional.Ajuste status, @NotNull LocalDateTime validoAte) {}
    record Resposta(PresencaOperacional presenca, String fuso) {}
}
