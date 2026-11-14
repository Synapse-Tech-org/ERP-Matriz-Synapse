package com.synapse.crm.core.application.mensagemprogramada;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.domain.mensagemprogramada.MensagemProgramada;

@Service
public class AtualizarMensagemProgramadaUseCase {
    private final MensagemProgramadaRepositorio mensagens;
    private final Clock relogio;

    public AtualizarMensagemProgramadaUseCase(MensagemProgramadaRepositorio mensagens, Clock relogio) {
        this.mensagens = mensagens;
        this.relogio = relogio;
    }

    @PreAuthorize("hasAnyRole('ATENDENTE','SUBGESTOR','GESTOR','ADMINISTRADOR','OPERADOR') and @capacidades.permite('mensagens_programadas.editar_cancelar')")
    @Transactional
    public Optional<MensagemProgramada> executar(UUID id, String conteudo, Instant dataEnvio) {
        return exigirEditavel(id, mensagens.atualizarAgendada(id, conteudo.trim(), dataEnvio));
    }

    @PreAuthorize("hasAnyRole('ATENDENTE','SUBGESTOR','GESTOR','ADMINISTRADOR','OPERADOR') and @capacidades.permite('mensagens_programadas.editar_cancelar')")
    @Transactional
    public Optional<MensagemProgramada> enviarAgora(UUID id) {
        return exigirEditavel(id, mensagens.anteciparAgendada(id, relogio.instant()));
    }

    private Optional<MensagemProgramada> exigirEditavel(UUID id, Optional<MensagemProgramada> alterada) {
        if (alterada.isEmpty() && mensagens.porIdVisivel(id).isPresent()) throw new MensagemProgramadaNaoEditavelException();
        return alterada;
    }
}
