package com.synapse.crm.equipe.application.usuario;

import java.time.Instant;
import java.util.UUID;

import com.synapse.crm.equipe.domain.usuario.PresencaOperacional.Ajuste;
import com.synapse.crm.equipe.domain.usuario.PresencaOperacional.Estado;

public interface PresencaOperacionalRepositorio {
    Situacao ler(UUID usuarioId, boolean comSetores, Instant agora);

    void gravar(UUID usuarioId, UUID autorId, Estado anterior, Ajuste novo, Instant agora, Instant validoAte);

    record Situacao(Ajuste ajuste, Instant validoAte, boolean foraDoSetor) {}
}
