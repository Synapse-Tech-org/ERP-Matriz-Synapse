package com.synapse.crm.relatorios.domain.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.junit.jupiter.api.Test;

class FiltroTemporalDashboardTest {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");

    @Test
    void deDias_hoje_comparaComODiaAnteriorDaMesmaDuracao() {
        LocalDate hoje = LocalDate.of(2026, 8, 28);
        FiltroTemporalDashboard filtro = FiltroTemporalDashboard.deDias(hoje, hoje, null, null, FUSO);

        assertThat(filtro.recorteInicio()).isEqualTo(hoje);
        assertThat(filtro.recorteFim()).isEqualTo(hoje);
        assertThat(filtro.meses()).containsExactly(8);
        assertThat(ChronoUnit.HOURS.between(
                        filtro.periodoAtual().getFirst().inicioInclusivo(),
                        filtro.periodoAtual().getFirst().fimExclusivo()))
                .isEqualTo(24);
        assertThat(filtro.comparacaoAnterior().fimExclusivo())
                .isEqualTo(filtro.periodoAtual().getFirst().inicioInclusivo());
        assertThat(ChronoUnit.HOURS.between(
                        filtro.comparacaoAnterior().inicioInclusivo(), filtro.comparacaoAnterior().fimExclusivo()))
                .isEqualTo(24);
    }

    @Test
    void deDias_seteDias_comparaComAJanelaImediatamenteAnterior() {
        LocalDate fim = LocalDate.of(2026, 8, 28);
        LocalDate inicio = fim.minusDays(6);
        FiltroTemporalDashboard filtro = FiltroTemporalDashboard.deDias(inicio, fim, null, null, FUSO);

        assertThat(ChronoUnit.DAYS.between(
                        filtro.periodoAtual().getFirst().inicioInclusivo(),
                        filtro.periodoAtual().getFirst().fimExclusivo()))
                .isEqualTo(7);
        assertThat(ChronoUnit.DAYS.between(
                        filtro.comparacaoAnterior().inicioInclusivo(), filtro.comparacaoAnterior().fimExclusivo()))
                .isEqualTo(7);
        assertThat(filtro.comparacaoAnterior().fimExclusivo())
                .isEqualTo(filtro.periodoAtual().getFirst().inicioInclusivo());
    }

    @Test
    void anoInteiro_noMesCorrente_comparaAteHojeComOsMesmosDiasDoMesAnterior() {
        LocalDate hoje = LocalDate.of(2026, 11, 17);
        FiltroTemporalDashboard filtro = FiltroTemporalDashboard.de(2026, null, null, null, FUSO, hoje);

        assertThat(filtro.comparacaoAtual().inicioInclusivo()).isEqualTo(inicio(LocalDate.of(2026, 11, 1)));
        assertThat(filtro.comparacaoAtual().fimExclusivo()).isEqualTo(inicio(LocalDate.of(2026, 11, 18)));
        assertThat(filtro.comparacaoAnterior().inicioInclusivo()).isEqualTo(inicio(LocalDate.of(2026, 10, 1)));
        assertThat(filtro.comparacaoAnterior().fimExclusivo()).isEqualTo(inicio(LocalDate.of(2026, 10, 18)));
        assertThat(filtro.comparacaoCobreOPeriodoAtual()).isFalse();
    }

    @Test
    void mesCorrenteNoDia31_limitaOMesAnteriorAoSeuUltimoDia() {
        LocalDate hoje = LocalDate.of(2026, 3, 31);
        FiltroTemporalDashboard filtro = FiltroTemporalDashboard.de(2026, List.of(3), null, null, FUSO, hoje);

        assertThat(filtro.comparacaoAnterior().inicioInclusivo()).isEqualTo(inicio(LocalDate.of(2026, 2, 1)));
        assertThat(filtro.comparacaoAnterior().fimExclusivo()).isEqualTo(inicio(LocalDate.of(2026, 3, 1)));
    }

    @Test
    void mesFechado_comparaOMesInteiroComOMesAnteriorInteiroEReaproveitaOPeriodo() {
        LocalDate hoje = LocalDate.of(2026, 11, 17);
        FiltroTemporalDashboard filtro = FiltroTemporalDashboard.de(2026, List.of(9), null, null, FUSO, hoje);

        assertThat(filtro.comparacaoAtual()).isEqualTo(filtro.periodoAtual().getFirst());
        assertThat(filtro.comparacaoAnterior().inicioInclusivo()).isEqualTo(inicioDoMes(YearMonth.of(2026, 8)));
        assertThat(filtro.comparacaoAnterior().fimExclusivo()).isEqualTo(inicioDoMes(YearMonth.of(2026, 9)));
        assertThat(filtro.comparacaoCobreOPeriodoAtual()).isTrue();
    }

    @Test
    void variosMeses_comparaOUltimoMesQueJaComecouComOAnterior() {
        LocalDate hoje = LocalDate.of(2026, 11, 17);
        FiltroTemporalDashboard filtro = FiltroTemporalDashboard.de(2026, List.of(7, 8, 12), null, null, FUSO, hoje);

        assertThat(filtro.comparacaoAtual().inicioInclusivo()).isEqualTo(inicioDoMes(YearMonth.of(2026, 8)));
        assertThat(filtro.comparacaoAnterior().inicioInclusivo()).isEqualTo(inicioDoMes(YearMonth.of(2026, 7)));
    }

    @Test
    void anoPassadoInteiro_comparaDezembroComNovembro() {
        LocalDate hoje = LocalDate.of(2026, 11, 17);
        FiltroTemporalDashboard filtro = FiltroTemporalDashboard.de(2025, null, null, null, FUSO, hoje);

        assertThat(filtro.comparacaoAtual().inicioInclusivo()).isEqualTo(inicioDoMes(YearMonth.of(2025, 12)));
        assertThat(filtro.comparacaoAnterior().inicioInclusivo()).isEqualTo(inicioDoMes(YearMonth.of(2025, 11)));
    }

    private static java.time.Instant inicio(LocalDate dia) {
        return dia.atStartOfDay(FUSO).toInstant();
    }

    private static java.time.Instant inicioDoMes(YearMonth mes) {
        return inicio(mes.atDay(1));
    }

    @Test
    void deEntrada_soInicio_reprova() {
        assertThatThrownBy(() -> FiltroTemporalDashboard.deEntrada(
                        2026,
                        null,
                        LocalDate.of(2026, 8, 28),
                        null,
                        null,
                        null,
                        FUSO))
                .isInstanceOf(FiltroDashboardInvalidoException.class);
    }

    @Test
    void deEntrada_semAnoNemRecorte_reprova() {
        assertThatThrownBy(() -> FiltroTemporalDashboard.deEntrada(null, null, null, null, null, null, FUSO))
                .isInstanceOf(FiltroDashboardInvalidoException.class);
    }
}
