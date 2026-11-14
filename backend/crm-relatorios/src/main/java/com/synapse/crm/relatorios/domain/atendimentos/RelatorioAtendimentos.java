package com.synapse.crm.relatorios.domain.atendimentos;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record RelatorioAtendimentos(
        List<Linha> linhas, Resumo resumo, List<Grupo> porStatus, List<Grupo> porEtapa,
        List<Grupo> porAtendente, String fusoHorario) {

    public record Linha(
            UUID id, UUID leadId, String cliente, String empresa, String atendente, String etapa,
            String status, Instant iniciadoEm, Instant finalizadoEm, Long duracaoSegundos, Integer csat) {}

    public record Resumo(long total, long finalizados, Long duracaoMediaSegundos,
                         BigDecimal csatMedio, long avaliacoes) {}

    public record Grupo(String id, String nome, long total, BigDecimal csatMedio) {}
}
