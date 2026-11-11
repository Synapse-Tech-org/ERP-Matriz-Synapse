package com.synapse.crm.relatorios.application.atendimentos;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.relatorios.domain.atendimentos.FiltroRelatorioAtendimentos;
import com.synapse.crm.relatorios.domain.atendimentos.RelatorioAtendimentos;

@Service
public class ConsultarRelatorioAtendimentosUseCase {
    private final RelatorioAtendimentosRepositorio repositorio;
    private final Clock relogio;
    private final ZoneId fuso;

    public ConsultarRelatorioAtendimentosUseCase(
            RelatorioAtendimentosRepositorio repositorio, Clock relogio,
            @Value("${synapse.tenant.timezone}") String fuso) {
        this.repositorio = repositorio;
        this.relogio = relogio;
        this.fuso = ZoneId.of(fuso);
    }

    @PreAuthorize("hasAnyRole('GESTOR','SUBGESTOR','ADMINISTRADOR') and @capacidades.permite('relatorios.ver')")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, timeout = 10)
    public RelatorioAtendimentos executar(FiltroRelatorioAtendimentos.Entrada entrada, int pagina, int tamanho) {
        if (pagina < 0 || tamanho < 1 || tamanho > 100) {
            throw new IllegalArgumentException("Página ou tamanho inválido.");
        }
        return repositorio.consultar(entrada.resolver(LocalDate.now(relogio.withZone(fuso)), fuso),
                pagina, tamanho, fuso.getId());
    }
}
