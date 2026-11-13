package com.synapse.crm.equipe.application.feedback;

import java.time.Clock;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.equipe.domain.feedback.FeedbackInvalidoException;

@Service
public class ResponderFeedbackUseCase {
    private final FeedbackRepositorio repositorio;
    private final Clock relogio;

    public ResponderFeedbackUseCase(FeedbackRepositorio repositorio, Clock relogio) {
        this.repositorio = repositorio;
        this.relogio = relogio;
    }

    @PreAuthorize("hasRole('ADMINISTRADOR')")
    @Transactional
    public boolean executar(UUID id, String resposta) {
        if (resposta == null || resposta.isBlank() || resposta.strip().length() > 2000) {
            throw new FeedbackInvalidoException("Informe uma resposta de até 2000 caracteres.");
        }
        return repositorio.responder(id, resposta.strip(), relogio.instant());
    }
}
