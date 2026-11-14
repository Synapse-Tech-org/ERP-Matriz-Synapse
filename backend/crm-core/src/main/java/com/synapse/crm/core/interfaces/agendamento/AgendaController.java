package com.synapse.crm.core.interfaces.agendamento;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import com.synapse.crm.core.application.agendamento.AlterarAgendamentoUseCase;
import com.synapse.crm.core.application.agendamento.CriarAgendamentoUseCase;
import com.synapse.crm.core.application.agendamento.ListarAgendaUseCase;
import com.synapse.crm.core.domain.agendamento.EstadoAgendamento;

@RestController
@RequestMapping("/api/v1/agenda-consultas")
@SecurityRequirement(name = "bearerAuth")
class AgendaController {
    private final ListarAgendaUseCase listar;
    private final CriarAgendamentoUseCase criar;
    private final AlterarAgendamentoUseCase alterar;
    private final ZoneId fuso;

    AgendaController(ListarAgendaUseCase listar, CriarAgendamentoUseCase criar, AlterarAgendamentoUseCase alterar,
            @Value("${synapse.tenant.timezone}") String fuso) {
        this.listar = listar;
        this.criar = criar;
        this.alterar = alterar;
        this.fuso = ZoneId.of(fuso);
    }

    @GetMapping
    @Operation(summary = "Listar agenda de consultas", description = "Lista as consultas visíveis de um dia no fuso da instância. Aceita busca por paciente, profissional ou tipo e filtro de estado.")
    ListarAgendaUseCase.Resultado listar(@RequestParam(required = false) LocalDate dia,
            @RequestParam(required = false) @Size(max = 160) String busca,
            @RequestParam(required = false) EstadoAgendamento estado) {
        return listar.executar(dia, busca, estado);
    }

    @PostMapping
    @Operation(summary = "Agendar consulta", description = "Vincula a consulta a um contato visível. O horário informado é local à instância. Horário ocupado retorna 409.")
    ResponseEntity<CriarAgendamentoUseCase.Criado> criar(@Valid @RequestBody NovaConsulta dados) {
        var registro = criar.executar(new CriarAgendamentoUseCase.NovaConsulta(dados.leadId(),
                noFuso(dados.inicio()), dados.profissional(), dados.tipo(), dados.cobertura()));
        return ResponseEntity.status(HttpStatus.CREATED).body(registro);
    }

    @PatchMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Atualizar consulta", description = "Altera o estado ou reagenda a consulta com a revisão esperada. Conflito de versão, transição ou horário retorna 409.")
    void alterar(@PathVariable UUID id, @Valid @RequestBody Alteracao dados) {
        if ((dados.inicio() == null) == (dados.estado() == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o novo horário ou o estado.");
        }
        alterar.executar(id, dados.revisao(), dados.estado(), dados.inicio() == null ? null : noFuso(dados.inicio()));
    }

    private Instant noFuso(LocalDateTime inicio) {
        var offsets = fuso.getRules().getValidOffsets(inicio);
        if (offsets.size() != 1 || inicio.getSecond() != 0 || inicio.getNano() != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Horário inválido no fuso da instância.");
        }
        return inicio.toInstant(offsets.getFirst());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail horarioOcupado(DataIntegrityViolationException erro) {
        if (erro.getMostSpecificCause() instanceof java.sql.SQLException sql && "23505".equals(sql.getSQLState())) {
            return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "O profissional já tem uma consulta neste horário.");
        }
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "O cadastro mudou. Confira os dados e tente novamente.");
    }

    record NovaConsulta(@NotNull UUID leadId, @NotNull LocalDateTime inicio,
            @NotBlank @Size(max = 160) String profissional, @NotBlank @Size(max = 160) String tipo,
            @Size(max = 160) String cobertura) {}
    record Alteracao(@NotNull @PositiveOrZero Long revisao, EstadoAgendamento estado, LocalDateTime inicio) {}
}
