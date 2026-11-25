package com.synapse.crm.equipe.application.usuario;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.equipe.domain.usuario.PresencaOperacional;
import com.synapse.crm.equipe.domain.usuario.PresencaOperacional.Ajuste;

@Service
public class AlterarPresencaOperacionalUseCase {
    private final EquipeRepositorio equipe;
    private final PresencaOperacionalRepositorio ajustes;
    private final AlcadaSobreIntegrantes alcada;
    private final ObterPresencaOperacionalUseCase consulta;
    private final Clock relogio;
    private final ZoneId fuso;

    public AlterarPresencaOperacionalUseCase(
            EquipeRepositorio equipe, PresencaOperacionalRepositorio ajustes,
            AlcadaSobreIntegrantes alcada, ObterPresencaOperacionalUseCase consulta, Clock relogio, ZoneId fuso) {
        this.equipe = equipe;
        this.ajustes = ajustes;
        this.alcada = alcada;
        this.consulta = consulta;
        this.relogio = relogio;
        this.fuso = fuso;
    }

    @PreAuthorize("hasAnyRole('GESTOR','SUBGESTOR','ADMINISTRADOR') and @capacidades.permite('equipe.disponibilidade_ia')")
    @Transactional
    public Optional<PresencaOperacional> executar(UUID usuarioId, Ajuste novo, LocalDateTime validadeLocal) {
        var encontrado = equipe.travarParaAlteracao(usuarioId);
        if (encontrado.isEmpty()) return Optional.empty();
        var alvo = encontrado.orElseThrow();
        alcada.exigirAlvo(usuarioId, alvo.papel());
        if (!ObterPresencaOperacionalUseCase.gerenciavel(alvo)) return Optional.empty();
        Instant agora = relogio.instant();
        var deslocamentos = fuso.getRules().getValidOffsets(validadeLocal);
        if (deslocamentos.size() != 1) throw new ValidadeDePresencaOperacionalInvalidaException();
        Instant validoAte = validadeLocal.toInstant(deslocamentos.getFirst());
        if (!validoAte.isAfter(agora)) throw new ValidadeDePresencaOperacionalInvalidaException();

        var anterior = consulta.avaliar(alvo, agora);
        ajustes.gravar(usuarioId, alcada.atual().id(), anterior.statusEfetivo(), novo, agora, validoAte);
        return Optional.of(consulta.avaliar(alvo, agora));
    }
}
