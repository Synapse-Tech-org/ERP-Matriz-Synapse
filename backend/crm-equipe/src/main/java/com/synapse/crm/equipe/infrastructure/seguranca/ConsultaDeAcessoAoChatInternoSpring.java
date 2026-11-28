package com.synapse.crm.equipe.infrastructure.seguranca;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.synapse.crm.equipe.application.permissao.ResolvedorDePermissoesEfetivas;
import com.synapse.crm.equipe.domain.permissao.Capacidade;
import com.synapse.crm.sharedkernel.permissao.ConsultaDeAcessoAoChatInterno;

@Component
class ConsultaDeAcessoAoChatInternoSpring implements ConsultaDeAcessoAoChatInterno {
    private final ResolvedorDePermissoesEfetivas permissoes;

    ConsultaDeAcessoAoChatInternoSpring(ResolvedorDePermissoesEfetivas permissoes) {
        this.permissoes = permissoes;
    }

    @Override
    public boolean permitido(UUID usuarioId) {
        return permissoes.de(usuarioId).filter(ResolvedorDePermissoesEfetivas.Resolvido::ativo)
                .map(r -> r.efetivas().permite(Capacidade.CHAT_INTERNO_USAR)).orElse(false);
    }
}
