package com.synapse.crm.equipe.application.feedback;

import java.time.Instant;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.sharedkernel.identidade.UsuarioContext;

@Service
public class ListarMeusFeedbacksUseCase {
    private final FeedbackRepositorio repositorio;
    private final UsuarioContext usuario;

    public ListarMeusFeedbacksUseCase(FeedbackRepositorio repositorio, UsuarioContext usuario) {
        this.repositorio = repositorio;
        this.usuario = usuario;
    }

    @PreAuthorize("hasAnyRole('ATENDENTE','SUBGESTOR','GESTOR','ADMINISTRADOR','OPERADOR')")
    @Transactional(readOnly = true)
    public FeedbackRepositorio.Pagina executar(Instant antesDe, UUID antesDoId, int limite) {
        ListarFeedbacksUseCase.validarPaginacao(antesDe, antesDoId, limite);
        return repositorio.listarDoAutor(usuario.atual().id(), antesDe, antesDoId, limite);
    }
}
