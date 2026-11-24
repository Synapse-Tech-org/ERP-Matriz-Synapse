package com.synapse.crm.app.atendimento;

import java.time.Instant;
import java.time.LocalDate;

import com.synapse.crm.atendimento.application.FinalizarAtendimentosNoFimDoExpedienteUseCase.Resultado;

/**
 * Uma linha por dia em que a finalização do fim do expediente rodou ({@code V126}).
 *
 * <p>A reserva é o que garante "uma vez por dia": o job verifica a cada minuto, pode haver mais de uma
 * réplica, e o backend pode reiniciar depois do horário. Quem consegue inserir o dia executa; os demais
 * desistem.
 */
interface ExecucoesDaFinalizacaoNoFimDoExpediente {

    /** {@code true} só para quem inseriu a linha do dia agora. */
    boolean reservar(LocalDate dia, Instant iniciadaEm);

    void concluir(LocalDate dia, Instant concluidaEm, Resultado resultado);
}
