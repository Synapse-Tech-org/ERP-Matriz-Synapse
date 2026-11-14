package com.synapse.crm.core.domain.agendamento;

public enum EstadoAgendamento {
    AGENDADO, CONFIRMADO, CHEGOU, EM_ATENDIMENTO, ATENDIDO, FALTOU, CANCELADO;

    public boolean permite(EstadoAgendamento destino) {
        return switch (this) {
            case AGENDADO -> destino == CONFIRMADO || destino == CHEGOU || destino == FALTOU || destino == CANCELADO;
            case CONFIRMADO -> destino == CHEGOU || destino == FALTOU || destino == CANCELADO;
            case CHEGOU -> destino == EM_ATENDIMENTO || destino == CANCELADO;
            case EM_ATENDIMENTO -> destino == ATENDIDO;
            case ATENDIDO, FALTOU, CANCELADO -> false;
        };
    }

    public boolean podeReagendar() {
        return this == AGENDADO || this == CONFIRMADO;
    }
}
