package com.synapse.crm.relatorios.domain.atendimentos;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

public record FiltroRelatorioAtendimentos(
        Instant inicio, Instant fimExclusivo, String busca, Status status, UUID etapa, UUID atendente) {

    public enum Status { EM_IA, EM_ATENDIMENTO, FINALIZADO }
    public enum Periodo { HOJE, SETE_DIAS, TRINTA_DIAS, MES, TRIMESTRE, ANO, PERSONALIZADO }

    public record Entrada(Periodo periodo, LocalDate inicio, LocalDate fim, String busca,
                          Status status, UUID etapa, UUID atendente) {
        public FiltroRelatorioAtendimentos resolver(LocalDate hoje, ZoneId fuso) {
            Periodo selecionado = periodo == null ? Periodo.TRINTA_DIAS : periodo;
            LocalDate de = switch (selecionado) {
                case HOJE -> hoje;
                case SETE_DIAS -> hoje.minusDays(6);
                case TRINTA_DIAS -> hoje.minusDays(29);
                case MES -> hoje.withDayOfMonth(1);
                case TRIMESTRE -> hoje.minusMonths(3).plusDays(1);
                case ANO -> hoje.withDayOfYear(1);
                case PERSONALIZADO -> inicio;
            };
            LocalDate ate = selecionado == Periodo.PERSONALIZADO ? fim : hoje;
            if (de == null || ate == null || de.isAfter(ate) || ate.isAfter(hoje)
                    || de.getYear() < 1 || ChronoUnit.DAYS.between(de, ate) > 365
                    || (busca != null && busca.length() > 150)) {
                throw new IllegalArgumentException("Confira o período de até um ano e a busca de até 150 caracteres.");
            }
            return new FiltroRelatorioAtendimentos(de.atStartOfDay(fuso).toInstant(),
                    ate.plusDays(1).atStartOfDay(fuso).toInstant(),
                    busca == null ? "" : busca.strip(), status, etapa, atendente);
        }
    }
}
