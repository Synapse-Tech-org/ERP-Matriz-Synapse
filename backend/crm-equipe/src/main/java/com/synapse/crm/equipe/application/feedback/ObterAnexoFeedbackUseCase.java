package com.synapse.crm.equipe.application.feedback;

import java.util.Optional;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.equipe.domain.feedback.AnexoFeedback;
import com.synapse.crm.sharedkernel.identidade.PapelUsuario;
import com.synapse.crm.sharedkernel.identidade.UsuarioContext;

@Service
public class ObterAnexoFeedbackUseCase {
    private final FeedbackRepositorio repositorio;
    private final UsuarioContext usuario;

    public ObterAnexoFeedbackUseCase(FeedbackRepositorio repositorio, UsuarioContext usuario) {
        this.repositorio = repositorio;
        this.usuario = usuario;
    }

    @PreAuthorize("hasAnyRole('ATENDENTE','SUBGESTOR','GESTOR','ADMINISTRADOR','OPERADOR')")
    @Transactional(readOnly = true)
    public Optional<AnexoFeedback> executar(UUID id) {
        var atual = usuario.atual();
        return repositorio.obterAnexo(id, atual.id(), atual.papel() == PapelUsuario.ADMINISTRADOR);
    }
}
