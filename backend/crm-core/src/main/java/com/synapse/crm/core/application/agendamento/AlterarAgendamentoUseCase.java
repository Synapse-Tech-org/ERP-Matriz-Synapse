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
public class AlterarAgendamentoUseCase {
    private final AgendaRepositorio agenda;

    public AlterarAgendamentoUseCase(AgendaRepositorio agenda) {
        this.agenda = agenda;
    }

    @PreAuthorize(AcessoAgenda.EDITAR)
    @Auditable(acao = "ALTERAR_AGENDAMENTO", entidadeTipo = "AGENDAMENTO", capturarDados = false)
    @Transactional
    public void executar(UUID id, long revisao, EstadoAgendamento destino, Instant novoInicio) {
        var atual = agenda.obterVisivel(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (atual.revisao() != revisao) throw new ResponseStatusException(HttpStatus.CONFLICT);
        boolean reagendar = novoInicio != null;
        if (reagendar ? !atual.estado().podeReagendar() : !atual.estado().permite(destino)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
        var alterada = new AgendaRepositorio.Consulta(id, atual.leadId(), atual.paciente(),
                reagendar ? novoInicio : atual.inicio(), atual.profissional(), atual.tipo(), atual.cobertura(),
                reagendar ? EstadoAgendamento.AGENDADO : destino, revisao + 1);
        if (!agenda.alterar(alterada, revisao)) throw new ResponseStatusException(HttpStatus.CONFLICT);
    }
}
