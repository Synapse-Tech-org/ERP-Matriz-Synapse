package com.synapse.crm.core.application.mensagemrapida;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.domain.mensagemrapida.MensagemRapida;
import com.synapse.crm.sharedkernel.identidade.UsuarioContext;

@Service
public class AtualizarMensagemRapidaUseCase {
    private final MensagemRapidaRepositorio repo;
    private final UsuarioContext usuario;

    public AtualizarMensagemRapidaUseCase(MensagemRapidaRepositorio repo, UsuarioContext usuario) {
        this.repo = repo;
        this.usuario = usuario;
    }

    @PreAuthorize("hasAnyRole('ATENDENTE','SUBGESTOR','GESTOR','ADMINISTRADOR','OPERADOR') and @capacidades.permite('mensagens_rapidas.editar_excluir')")
    @Transactional
    public Optional<MensagemRapida> executar(UUID id, String chave, String conteudo, Boolean geral) {
        var atual = usuario.atual();
        if (Boolean.TRUE.equals(geral) && !atual.papel().enxergaTodosOsLeads()) {
            throw new AccessDeniedException("Somente a gestão pode publicar mensagens gerais.");
        }
        return repo.atualizar(
                id,
                new EscopoMensagensRapidas(
                        atual.id(), atual.papel().enxergaTodosOsLeads()),
                chave.trim().toLowerCase(Locale.ROOT),
                conteudo.trim(),
                geral);
    }
}
