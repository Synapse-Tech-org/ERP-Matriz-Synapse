package com.synapse.crm.core.infrastructure.persistencia.lead;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import com.synapse.crm.core.domain.agendamento.EstadoAgendamento;

@Entity
@Table(name = "agendamento")
class AgendamentoEntity {
    @Id UUID id;
    @Column(name = "lead_id") UUID leadId;
    Instant inicio;
    String profissional;
    String tipo;
    String cobertura;
    @Enumerated(EnumType.STRING) EstadoAgendamento estado;
    long revisao;
}
