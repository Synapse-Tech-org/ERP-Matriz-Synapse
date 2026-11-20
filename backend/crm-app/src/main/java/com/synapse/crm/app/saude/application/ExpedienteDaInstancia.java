package com.synapse.crm.app.saude.application;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;

/**
 * Fim do expediente de um dia, lido da mesma janela de horário comercial que o alerta de saúde usa
 * ({@code alerta.horario_cliente.*}). Separado de {@link HorarioComercialDoCliente} para que quem só
 * pergunta "posso avisar o cliente agora?" continue com uma interface de um método.
 */
public interface ExpedienteDaInstancia {

    /** Vazio quando o dia está fechado ou quando não há janela legível configurada. */
    Optional<LocalTime> fimDoExpediente(LocalDate dia);
}
