package com.synapse.crm.core.application.agendamento;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.domain.agendamento.EstadoAgendamento;

@Service
public class ListarAgendaUseCase {
    private final AgendaRepositorio agenda;
    private final ZoneId fuso;
    private final Clock relogio;
    private final int limite;

    public ListarAgendaUseCase(AgendaRepositorio agenda, Clock relogio,
            @Value("${synapse.tenant.timezone}") String fuso,
            @Value("${synapse.agenda.limite-dia:250}") int limite) {
        this.agenda = agenda;
        this.relogio = relogio;
        this.fuso = ZoneId.of(fuso);
        if (limite < 1) throw new IllegalArgumentException("Limite da agenda deve ser positivo");
        this.limite = limite;
    }

    public record Resultado(LocalDate dia, LocalDate hoje, String fusoHorario, AgendaRepositorio.Dia agenda) {}

    @PreAuthorize(AcessoAgenda.LER)
    @Transactional(readOnly = true)
    public Resultado executar(LocalDate dia, String busca, EstadoAgendamento estado) {
        LocalDate hoje = LocalDate.now(relogio.withZone(fuso));
        LocalDate selecionado = dia == null ? hoje : dia;
        var filtro = new AgendaRepositorio.Filtro(selecionado.atStartOfDay(fuso).toInstant(),
                selecionado.plusDays(1).atStartOfDay(fuso).toInstant(), busca == null ? "" : busca.strip(), estado);
        return new Resultado(selecionado, hoje, fuso.getId(), agenda.listar(filtro, limite));
    }
}
