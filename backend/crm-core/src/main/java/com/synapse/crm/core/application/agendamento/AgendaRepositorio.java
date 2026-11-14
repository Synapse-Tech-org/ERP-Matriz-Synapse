package com.synapse.crm.core.application.agendamento;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.synapse.crm.core.domain.agendamento.EstadoAgendamento;

public interface AgendaRepositorio {
    record Consulta(UUID id, UUID leadId, String paciente, Instant inicio, String profissional,
            String tipo, String cobertura, EstadoAgendamento estado, long revisao) {}

    record Filtro(Instant inicio, Instant fim, String busca, EstadoAgendamento estado) {}

    record Dia(List<Consulta> itens, boolean limiteAtingido) {}

    Dia listar(Filtro filtro, int limite);

    Optional<Consulta> obterVisivel(UUID id);

    boolean leadVisivel(UUID leadId);

    void criar(Consulta consulta);

    boolean alterar(Consulta consulta, long revisao);
}
