package com.synapse.crm.core.application.agendamento;

import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.synapse.crm.core.domain.agendamento.EstadoAgendamento;
import com.synapse.crm.sharedkernel.auditoria.Auditable;

@Service
public class CriarAgendamentoUseCase {
    private final AgendaRepositorio agenda;

    public CriarAgendamentoUseCase(AgendaRepositorio agenda) {
        this.agenda = agenda;
    }

    public record NovaConsulta(UUID leadId, Instant inicio, String profissional, String tipo, String cobertura) {}
    public record Criado(UUID id) {}

    @PreAuthorize(AcessoAgenda.EDITAR)
    @Auditable(acao = "CRIAR_AGENDAMENTO", entidadeTipo = "AGENDAMENTO", capturarDados = false)
    @Transactional
    public Criado executar(NovaConsulta dados) {
        if (!agenda.leadVisivel(dados.leadId())) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var id = UUID.randomUUID();
        String cobertura = dados.cobertura();
        agenda.criar(new AgendaRepositorio.Consulta(id, dados.leadId(), null, dados.inicio(), dados.profissional().strip(),
                dados.tipo().strip(), cobertura == null || cobertura.isBlank() ? null : cobertura.strip(), EstadoAgendamento.AGENDADO, 0));
        return new Criado(id);
    }
}
