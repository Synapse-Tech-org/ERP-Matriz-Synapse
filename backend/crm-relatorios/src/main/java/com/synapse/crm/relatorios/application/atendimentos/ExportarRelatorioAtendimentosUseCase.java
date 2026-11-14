package com.synapse.crm.relatorios.application.atendimentos;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.relatorios.domain.atendimentos.FiltroRelatorioAtendimentos;
import com.synapse.crm.relatorios.domain.atendimentos.RelatorioAtendimentos.Linha;

@Service
public class ExportarRelatorioAtendimentosUseCase {
    private final RelatorioAtendimentosRepositorio repositorio;
    private final Clock relogio;
    private final ZoneId fuso;

    public ExportarRelatorioAtendimentosUseCase(
            RelatorioAtendimentosRepositorio repositorio, Clock relogio,
            @Value("${synapse.tenant.timezone}") String fuso) {
        this.repositorio = repositorio;
        this.relogio = relogio;
        this.fuso = ZoneId.of(fuso);
    }

    @PreAuthorize("hasAnyRole('GESTOR','SUBGESTOR','ADMINISTRADOR') and @capacidades.permite('relatorios.exportar')")
    @Transactional(readOnly = true, timeout = 10)
    public List<Linha> executar(FiltroRelatorioAtendimentos.Entrada entrada, int limite) {
        return repositorio.listar(entrada.resolver(LocalDate.now(relogio.withZone(fuso)), fuso), limite, 0);
    }
}
