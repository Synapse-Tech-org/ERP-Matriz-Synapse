package com.synapse.crm.core.application.lembrete;

import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.sharedkernel.identidade.UsuarioContext;

@Service
public class RemoverLembreteUseCase {
    private final LembreteRepositorio lembretes;

    private final UsuarioContext usuario;

    public RemoverLembreteUseCase(LembreteRepositorio lembretes, UsuarioContext usuario) {
        this.lembretes = lembretes;
        this.usuario = usuario;
    }

    @PreAuthorize("hasAnyRole('ATENDENTE', 'SUBGESTOR', 'GESTOR', 'ADMINISTRADOR','OPERADOR') and @capacidades.permite('lembretes.editar_excluir')")
    @Transactional
    public boolean executar(UUID id, UUID chaveExclusao) {
        return chaveExclusao == null ? lembretes.remover(id) : lembretes.excluirComDesfazer(id, usuario.atual().id(), chaveExclusao);
    }

    @PreAuthorize("hasAnyRole('ATENDENTE', 'SUBGESTOR', 'GESTOR', 'ADMINISTRADOR','OPERADOR') and @capacidades.permite('lembretes.editar_excluir')")
    @Transactional
    public boolean restaurar(UUID id, UUID chaveExclusao) {
        return lembretes.restaurarExclusao(id, usuario.atual().id(), chaveExclusao);
    }
}
