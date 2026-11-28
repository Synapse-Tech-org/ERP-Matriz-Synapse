package com.synapse.crm.sharedkernel.permissao;

import java.util.UUID;

/** Consulta de acesso do destinatário, para entregas que não têm uma sessão autenticada corrente. */
public interface ConsultaDeAcessoAoChatInterno {
    boolean permitido(UUID usuarioId);
}
