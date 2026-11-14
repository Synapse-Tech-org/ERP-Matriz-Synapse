package com.synapse.crm.core.application.lembrete;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ListarLembretesUseCase {
    private final LembreteRepositorio lembretes;

    private final Clock relogio;
    private final ZoneId fuso;

    public ListarLembretesUseCase(LembreteRepositorio lembretes, Clock relogio,
            @Value("${synapse.tenant.timezone}") String fuso) {
        this.lembretes = lembretes;
        this.relogio = relogio;
        this.fuso = ZoneId.of(fuso);
    }

    @PreAuthorize("hasAnyRole('ATENDENTE', 'SUBGESTOR', 'GESTOR', 'ADMINISTRADOR','OPERADOR') and @capacidades.permite('lembretes.ver')")
    @Transactional(readOnly = true)
    public PaginaLembretes executar(FiltroLembretes filtro, boolean incluirResumo) {
        var pagina = lembretes.listar(filtro);
        if (!incluirResumo) return pagina;

        var agora = relogio.instant();
        var hoje = agora.atZone(fuso).toLocalDate();
        var fimHoje = hoje.plusDays(1).atStartOfDay(fuso).toInstant();
        var fimSemana = hoje.with(TemporalAdjusters.next(DayOfWeek.MONDAY)).atStartOfDay(fuso).toInstant();
        return new PaginaLembretes(pagina.lembretes(), pagina.pagina(), pagina.temMais(),
                lembretes.resumir(filtro, agora, fimHoje, fimSemana));
    }
}
