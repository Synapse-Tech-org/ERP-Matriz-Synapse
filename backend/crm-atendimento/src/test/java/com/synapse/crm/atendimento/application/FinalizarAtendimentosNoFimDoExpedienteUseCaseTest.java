package com.synapse.crm.atendimento.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.synapse.crm.atendimento.domain.atendimento.Atendimento;

class FinalizarAtendimentosNoFimDoExpedienteUseCaseTest {

    private static final Instant CORTE = Instant.parse("2026-11-18T21:00:00Z");

    @Test
    void percorreLotesAteAcabaremOsCandidatos() {
        var listar = mock(ListarAtendimentosInativosUseCase.class);
        var finalizar = mock(FinalizarAtendimentoUseCase.class);
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        UUID c = UUID.randomUUID();
        when(listar.executar(CORTE, 2)).thenReturn(List.of(a, b), List.of(c));
        when(finalizar.executarNoFimDoExpediente(any(), any())).thenReturn(Optional.of(mock(Atendimento.class)));

        var resultado = new FinalizarAtendimentosNoFimDoExpedienteUseCase(listar, finalizar).executar(CORTE, 2);

        assertThat(resultado.finalizados()).isEqualTo(3);
        assertThat(resultado.ignorados()).isZero();
        assertThat(resultado.falhas()).isZero();
        verify(listar, times(2)).executar(CORTE, 2);
    }

    @Test
    void paraQuandoUmLoteInteiroFicaParadoParaNaoGirarSobreOsMesmosIgnorados() {
        var listar = mock(ListarAtendimentosInativosUseCase.class);
        var finalizar = mock(FinalizarAtendimentoUseCase.class);
        UUID negociacao = UUID.randomUUID();
        UUID comFalha = UUID.randomUUID();
        when(listar.executar(CORTE, 2)).thenReturn(List.of(negociacao, comFalha));
        when(finalizar.executarNoFimDoExpediente(negociacao, CORTE)).thenReturn(Optional.empty());
        when(finalizar.executarNoFimDoExpediente(comFalha, CORTE)).thenThrow(new IllegalStateException("x"));

        var resultado = new FinalizarAtendimentosNoFimDoExpedienteUseCase(listar, finalizar).executar(CORTE, 2);

        assertThat(resultado.finalizados()).isZero();
        assertThat(resultado.ignorados()).isEqualTo(1);
        assertThat(resultado.falhas()).isEqualTo(1);
        verify(listar, times(1)).executar(CORTE, 2);
    }
}
