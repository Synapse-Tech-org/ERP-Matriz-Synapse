package com.synapse.crm.core.application.lembrete;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.application.lead.LeadRepositorio;
import com.synapse.crm.core.domain.lembrete.Lembrete;
import com.synapse.crm.sharedkernel.identidade.UsuarioContext;

@Service
public class CriarLembreteUseCase {
    private final LeadRepositorio leads;
    private final LembreteRepositorio lembretes;
    private final UsuarioContext usuario;

    public CriarLembreteUseCase(LeadRepositorio leads, LembreteRepositorio lembretes, UsuarioContext usuario) {
        this.leads = leads;
        this.lembretes = lembretes;
        this.usuario = usuario;
    }

    @PreAuthorize("hasAnyRole('ATENDENTE', 'SUBGESTOR', 'GESTOR', 'ADMINISTRADOR','OPERADOR') and @capacidades.permite('lembretes.criar') and (#responsavelId == null or (hasAnyRole('SUBGESTOR','GESTOR','ADMINISTRADOR') and @capacidades.permite('equipe.ver')))")
    @Transactional
    public Optional<Lembrete> executar(UUID leadId, String texto, Instant dataHora, UUID responsavelId) {
        if (leadId != null && leads.porId(leadId).isEmpty()) return Optional.empty();
        if (responsavelId != null && !lembretes.reservarResponsavelAtivo(responsavelId)) return Optional.empty();
        UUID atendenteId = responsavelId == null ? usuario.atual().id() : responsavelId;
        return Optional.of(lembretes.criar(leadId, atendenteId, texto.trim(), dataHora));
    }
}
