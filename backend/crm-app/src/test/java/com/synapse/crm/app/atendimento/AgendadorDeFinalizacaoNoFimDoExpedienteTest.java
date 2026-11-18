package com.synapse.crm.app.atendimento;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.synapse.crm.app.saude.application.ExpedienteDaInstancia;
import com.synapse.crm.atendimento.application.FinalizarAtendimentosNoFimDoExpedienteUseCase;
import com.synapse.crm.automacaoconfig.application.ConfiguracaoAutomacaoRepositorio;
import com.synapse.crm.automacaoconfig.domain.ConfiguracaoAutomacao;
import com.synapse.crm.automacaoconfig.domain.TipoConfiguracaoAutomacao;
import com.synapse.crm.sharedkernel.identidade.ContextoDeServico;

/** Fuso America/Sao_Paulo (UTC-3). 18/11/2026 é quarta-feira; 18:00 local = 21:00Z. */
class AgendadorDeFinalizacaoNoFimDoExpedienteTest {

    private static final ZoneId FUSO = ZoneId.of("America/Sao_Paulo");
    private static final LocalDate QUARTA = LocalDate.parse("2026-11-18");
    private static final Instant DEZOITO_HORAS = Instant.parse("2026-11-18T21:00:00Z");

    private final Map<String, String> parametros = new HashMap<>();
    private final ExpedienteDaInstancia expediente = mock(ExpedienteDaInstancia.class);
    private final FinalizarAtendimentosNoFimDoExpedienteUseCase finalizar =
            mock(FinalizarAtendimentosNoFimDoExpedienteUseCase.class);
    private final ExecucoesDaFinalizacaoNoFimDoExpediente execucoes = mock(ExecucoesDaFinalizacaoNoFimDoExpediente.class);

    @BeforeEach
    void preparar() {
        ContextoDeServico.instalarPonteDeAutoridade(nome -> () -> {});
        parametros.put(AgendadorDeFinalizacaoNoFimDoExpediente.CHAVE_HABILITADO, "true");
        parametros.put(AgendadorDeFinalizacaoNoFimDoExpediente.CHAVE_USAR_EXPEDIENTE, "true");
        parametros.put(AgendadorDeFinalizacaoNoFimDoExpediente.CHAVE_HORARIO, "20:00");
        when(expediente.fimDoExpediente(QUARTA)).thenReturn(Optional.of(LocalTime.of(18, 0)));
        when(execucoes.reservar(any(), any())).thenReturn(true);
        when(finalizar.executar(any(), anyInt()))
                .thenReturn(new FinalizarAtendimentosNoFimDoExpedienteUseCase.Resultado(3, 1, 0));
    }

    @AfterEach
    void limpar() {
        ContextoDeServico.instalarPonteDeAutoridade(ContextoDeServico.PonteDeAutoridade.NAO_INSTALADA);
    }

    @Test
    void desligado_naoReservaNemFinaliza() {
        parametros.put(AgendadorDeFinalizacaoNoFimDoExpediente.CHAVE_HABILITADO, "false");

        agendador(DEZOITO_HORAS.plusSeconds(60)).verificar();

        verifyNoInteractions(execucoes, finalizar);
    }

    @Test
    void antesDoFimDoExpediente_naoFazNada() {
        agendador(DEZOITO_HORAS.minusSeconds(60)).verificar();

        verifyNoInteractions(execucoes, finalizar);
    }

    @Test
    void noFimDoExpediente_reservaODiaEFinalizaComCorteNoHorario() {
        agendador(DEZOITO_HORAS.plusSeconds(60)).verificar();

        verify(execucoes).reservar(QUARTA, DEZOITO_HORAS.plusSeconds(60));
        verify(finalizar).executar(DEZOITO_HORAS, 50);
        verify(execucoes).concluir(any(), any(), any());
    }

    @Test
    void diaJaReservadoPorOutraRodadaOuReplica_naoFinalizaDeNovo() {
        when(execucoes.reservar(any(), any())).thenReturn(false);

        agendador(DEZOITO_HORAS.plusSeconds(60)).verificar();

        verify(finalizar, never()).executar(any(), anyInt());
    }

    @Test
    void diaFechadoNoExpediente_naoFinaliza() {
        when(expediente.fimDoExpediente(QUARTA)).thenReturn(Optional.empty());

        agendador(DEZOITO_HORAS.plusSeconds(60)).verificar();

        verifyNoInteractions(execucoes, finalizar);
    }

    @Test
    void horarioPersonalizado_substituiOFimDoExpediente() {
        parametros.put(AgendadorDeFinalizacaoNoFimDoExpediente.CHAVE_USAR_EXPEDIENTE, "false");

        agendador(DEZOITO_HORAS.plusSeconds(60)).verificar();
        verifyNoInteractions(execucoes, finalizar);

        Instant vinteHoras = Instant.parse("2026-11-18T23:00:00Z");
        agendador(vinteHoras.plusSeconds(60)).verificar();
        verify(finalizar).executar(vinteHoras, 50);
    }

    @Test
    void ligadoMuitoDepoisDoHorario_naoFinalizaRetroativamente() {
        agendador(DEZOITO_HORAS.plus(AgendadorDeFinalizacaoNoFimDoExpediente.TOLERANCIA).plusSeconds(60)).verificar();

        verifyNoInteractions(execucoes, finalizar);
    }

    @Test
    void horarioPersonalizadoIlegivel_naoFinaliza() {
        parametros.put(AgendadorDeFinalizacaoNoFimDoExpediente.CHAVE_USAR_EXPEDIENTE, "false");
        parametros.put(AgendadorDeFinalizacaoNoFimDoExpediente.CHAVE_HORARIO, "18h");

        agendador(DEZOITO_HORAS.plusSeconds(60)).verificar();

        verifyNoInteractions(execucoes, finalizar);
    }

    private AgendadorDeFinalizacaoNoFimDoExpediente agendador(Instant agora) {
        ConfiguracaoAutomacaoRepositorio configuracoes = mock(ConfiguracaoAutomacaoRepositorio.class);
        when(configuracoes.porChave(any())).thenAnswer(inv -> {
            String chave = inv.getArgument(0);
            return Optional.ofNullable(parametros.get(chave)).map(valor -> new ConfiguracaoAutomacao(
                    chave, valor, null,
                    chave.endsWith(".horario") ? TipoConfiguracaoAutomacao.TEXT : TipoConfiguracaoAutomacao.BOOLEAN,
                    null, null, null, null, Instant.EPOCH));
        });
        return new AgendadorDeFinalizacaoNoFimDoExpediente(
                configuracoes, expediente, finalizar, execucoes,
                new FinalizacaoAtendimentoInativoProperties(50), FUSO, Clock.fixed(agora, ZoneOffset.UTC));
    }
}
