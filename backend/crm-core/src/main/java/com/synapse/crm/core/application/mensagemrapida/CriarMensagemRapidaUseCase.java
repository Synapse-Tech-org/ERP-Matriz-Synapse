package com.synapse.crm.core.application.mensagemrapida;

import java.util.Locale;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.domain.mensagemrapida.MensagemRapida;
import com.synapse.crm.sharedkernel.identidade.UsuarioContext;

@Service
public class CriarMensagemRapidaUseCase {
    private final MensagemRapidaRepositorio repo;
    private final UsuarioContext usuario;

    public CriarMensagemRapidaUseCase(MensagemRapidaRepositorio repo, UsuarioContext usuario) {
        this.repo = repo;
        this.usuario = usuario;
    }

    @PreAuthorize("hasAnyRole('ATENDENTE','SUBGESTOR','GESTOR','ADMINISTRADOR','OPERADOR') and @capacidades.permite('mensagens_rapidas.criar')")
    @Transactional
    public MensagemRapida executar(String chave, String conteudo, boolean geral) {
        var atual = usuario.atual();
        if (geral && !atual.papel().enxergaTodosOsLeads()) {
            throw new AccessDeniedException("Somente a gestão pode publicar mensagens gerais.");
        }
        return repo.criar(
                atual.id(), chave.trim().toLowerCase(Locale.ROOT), conteudo.trim(), geral);
    }
}
