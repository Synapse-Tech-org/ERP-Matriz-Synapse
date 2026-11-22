package com.synapse.crm.relatorios.domain.dashboard;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import com.synapse.crm.relatorios.domain.IntervaloTemporal;

/**
 * Janelas temporais validadas do dashboard, sempre com fim exclusivo.
 *
 * <p>{@code comparacaoAtual} e {@code comparacaoAnterior} alimentam o selo de variacao dos cards:
 * com meses selecionados, o mes de referencia (o ultimo selecionado que ja comecou) contra o mes
 * anterior; no mes corrente, do dia 1 ate hoje contra os mesmos dias do mes anterior. Com recorte
 * por dias, o proprio recorte contra a janela imediatamente anterior de mesma duracao. A granularidade
 * e de dia para a chave do cache (que usa o filtro inteiro) nao mudar a cada requisicao.
 */
public record FiltroTemporalDashboard(
        int ano,
        List<Integer> meses,
        LocalDate recorteInicio,
        LocalDate recorteFim,
        List<IntervaloTemporal> periodoAtual,
        IntervaloTemporal comparacaoAtual,
        IntervaloTemporal comparacaoAnterior,
        IntervaloTemporal periodoDeOriginacao,
        ZoneId fusoHorario) {

    public FiltroTemporalDashboard {
        meses = List.copyOf(meses);
        periodoAtual = List.copyOf(periodoAtual);
        Objects.requireNonNull(comparacaoAtual, "periodo de comparacao e obrigatorio");
        Objects.requireNonNull(comparacaoAnterior, "periodo anterior e obrigatorio");
        Objects.requireNonNull(fusoHorario, "fuso horario e obrigatorio");
        if (meses.isEmpty() || periodoAtual.isEmpty()) {
            throw new FiltroDashboardInvalidoException("ao menos um mes deve ser selecionado");
        }
        if ((recorteInicio == null) != (recorteFim == null)) {
            throw new FiltroDashboardInvalidoException(
                    "recorteInicio e recorteFim devem ser informados juntos");
        }
    }

    public static FiltroTemporalDashboard deEntrada(
            Integer ano,
            List<Integer> meses,
            LocalDate inicio,
            LocalDate fim,
            LocalDate origemInicio,
            LocalDate origemFim,
            ZoneId fusoHorario) {
        if ((inicio == null) != (fim == null)) {
            throw new FiltroDashboardInvalidoException("inicio e fim devem ser informados juntos");
        }
        if (inicio != null) {
            return deDias(inicio, fim, origemInicio, origemFim, fusoHorario);
        }
        if (ano == null) {
            throw new FiltroDashboardInvalidoException("ano e obrigatorio sem recorte diario");
        }
        return de(ano, meses, origemInicio, origemFim, fusoHorario, LocalDate.now(fusoHorario));
    }

    public static FiltroTemporalDashboard de(
            int ano,
            List<Integer> mesesInformados,
            LocalDate origemInicio,
            LocalDate origemFim,
            ZoneId fusoHorario) {
        return de(ano, mesesInformados, origemInicio, origemFim, fusoHorario, LocalDate.now(fusoHorario));
    }

    public static FiltroTemporalDashboard de(
            int ano,
            List<Integer> mesesInformados,
            LocalDate origemInicio,
            LocalDate origemFim,
            ZoneId fusoHorario,
            LocalDate hoje) {
        Objects.requireNonNull(hoje, "data de hoje e obrigatoria");
        try {
            Year.of(ano);
        } catch (DateTimeException erro) {
            throw new FiltroDashboardInvalidoException("ano fora da faixa suportada");
        }
        List<Integer> meses = mesesInformados == null || mesesInformados.isEmpty()
                ? java.util.stream.IntStream.rangeClosed(1, 12).boxed().toList()
                : mesesInformados.stream().distinct().sorted().toList();
        if (meses.stream().anyMatch(mes -> mes < 1 || mes > 12)) {
            throw new FiltroDashboardInvalidoException("meses devem estar entre 1 e 12");
        }
        IntervaloTemporal origem = originacao(origemInicio, origemFim, fusoHorario);

        List<IntervaloTemporal> atuais = meses.stream()
                .map(mes -> intervaloDoMes(YearMonth.of(ano, mes), fusoHorario))
                .toList();
        YearMonth mesCorrente = YearMonth.from(hoje);
        YearMonth referencia = meses.reversed().stream()
                .map(mes -> YearMonth.of(ano, mes))
                .filter(mes -> !mes.isAfter(mesCorrente))
                .findFirst()
                .orElse(YearMonth.of(ano, meses.getLast()));
        YearMonth anterior = referencia.minusMonths(1);
        IntervaloTemporal comparacaoAtual;
        IntervaloTemporal comparacaoAnterior;
        if (referencia.equals(mesCorrente)) {
            int dia = hoje.getDayOfMonth();
            comparacaoAtual = new IntervaloTemporal(
                    inicioDoDia(referencia.atDay(1), fusoHorario),
                    inicioDoDia(hoje.plusDays(1), fusoHorario));
            comparacaoAnterior = new IntervaloTemporal(
                    inicioDoDia(anterior.atDay(1), fusoHorario),
                    inicioDoDia(anterior.atDay(Math.min(dia, anterior.lengthOfMonth())).plusDays(1), fusoHorario));
        } else {
            comparacaoAtual = intervaloDoMes(referencia, fusoHorario);
            comparacaoAnterior = intervaloDoMes(anterior, fusoHorario);
        }
        return new FiltroTemporalDashboard(
                ano,
                meses,
                null,
                null,
                atuais,
                comparacaoAtual,
                comparacaoAnterior,
                origem,
                fusoHorario);
    }

    public static FiltroTemporalDashboard deDias(
            LocalDate inicio,
            LocalDate fim,
            LocalDate origemInicio,
            LocalDate origemFim,
            ZoneId fusoHorario) {
        Objects.requireNonNull(inicio, "inicio do recorte e obrigatorio");
        Objects.requireNonNull(fim, "fim do recorte e obrigatorio");
        Objects.requireNonNull(fusoHorario, "fuso horario e obrigatorio");
        if (inicio.isAfter(fim)) {
            throw new FiltroDashboardInvalidoException("inicio nao pode ser posterior ao fim");
        }
        long dias = ChronoUnit.DAYS.between(inicio, fim) + 1;
        IntervaloTemporal atual = new IntervaloTemporal(
                inicio.atStartOfDay(fusoHorario).toInstant(),
                fim.plusDays(1).atStartOfDay(fusoHorario).toInstant());
        LocalDate anteriorInicio = inicio.minusDays(dias);
        IntervaloTemporal anterior = new IntervaloTemporal(
                anteriorInicio.atStartOfDay(fusoHorario).toInstant(),
                inicio.atStartOfDay(fusoHorario).toInstant());
        return new FiltroTemporalDashboard(
                inicio.getYear(),
                mesesQueCruzam(inicio, fim),
                inicio,
                fim,
                List.of(atual),
                atual,
                anterior,
                originacao(origemInicio, origemFim, fusoHorario),
                fusoHorario);
    }

    /** Verdadeiro quando o selo compara exatamente o periodo exibido (dispensa nova consulta). */
    public boolean comparacaoCobreOPeriodoAtual() {
        return periodoAtual.equals(List.of(comparacaoAtual));
    }

    public Instant fimDoPeriodoAtual() {
        return periodoAtual.stream()
                .map(IntervaloTemporal::fimExclusivo)
                .max(Instant::compareTo)
                .orElseThrow();
    }

    private static IntervaloTemporal originacao(
            LocalDate origemInicio, LocalDate origemFim, ZoneId fusoHorario) {
        if ((origemInicio == null) != (origemFim == null)) {
            throw new FiltroDashboardInvalidoException(
                    "origemInicio e origemFim devem ser informados juntos");
        }
        if (origemInicio != null && origemInicio.isAfter(origemFim)) {
            throw new FiltroDashboardInvalidoException(
                    "origemInicio nao pode ser posterior a origemFim");
        }
        if (origemInicio == null) {
            return null;
        }
        return new IntervaloTemporal(
                origemInicio.atStartOfDay(fusoHorario).toInstant(),
                origemFim.plusDays(1).atStartOfDay(fusoHorario).toInstant());
    }

    private static List<Integer> mesesQueCruzam(LocalDate inicio, LocalDate fim) {
        List<Integer> meses = new ArrayList<>();
        YearMonth cursor = YearMonth.from(inicio);
        YearMonth ultimo = YearMonth.from(fim);
        while (!cursor.isAfter(ultimo)) {
            meses.add(cursor.getMonthValue());
            cursor = cursor.plusMonths(1);
        }
        return meses;
    }

    private static Instant inicioDoDia(LocalDate dia, ZoneId fusoHorario) {
        return dia.atStartOfDay(fusoHorario).toInstant();
    }

    private static IntervaloTemporal intervaloDoMes(YearMonth mes, ZoneId fusoHorario) {
        return new IntervaloTemporal(
                mes.atDay(1).atStartOfDay(fusoHorario).toInstant(),
                mes.plusMonths(1).atDay(1).atStartOfDay(fusoHorario).toInstant());
    }
}
