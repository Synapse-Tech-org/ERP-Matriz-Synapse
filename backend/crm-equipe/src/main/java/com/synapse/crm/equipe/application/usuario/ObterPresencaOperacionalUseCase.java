package com.synapse.crm.equipe.application.usuario;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.equipe.application.setor.HabilitacaoDeSetores;
import com.synapse.crm.equipe.domain.usuario.PresencaOperacional;
import com.synapse.crm.equipe.domain.usuario.Usuario;
import com.synapse.crm.sharedkernel.identidade.PapelUsuario;
import com.synapse.crm.sharedkernel.permissao.VerificadorDeCapacidades;

@Service
public class ObterPresencaOperacionalUseCase {
    private final EquipeRepositorio equipe;
    private final PresencaOperacionalRepositorio ajustes;
    private final HabilitacaoDeSetores setores;
    private final AlcadaSobreIntegrantes alcada;
    private final VerificadorDeCapacidades capacidades;
    private final Clock relogio;

    public ObterPresencaOperacionalUseCase(
            EquipeRepositorio equipe, PresencaOperacionalRepositorio ajustes, HabilitacaoDeSetores setores,
            AlcadaSobreIntegrantes alcada, VerificadorDeCapacidades capacidades, Clock relogio) {
        this.equipe = equipe;
        this.ajustes = ajustes;
        this.setores = setores;
        this.alcada = alcada;
        this.capacidades = capacidades;
        this.relogio = relogio;
    }

    @PreAuthorize("hasAnyRole('GESTOR','SUBGESTOR','ADMINISTRADOR') and @capacidades.permite('equipe.ver')")
    @Transactional(readOnly = true)
    public Optional<PresencaOperacional> executar(UUID usuarioId) {
        return equipe.porId(usuarioId).map(alvo -> avaliar(alvo, relogio.instant()));
    }

    PresencaOperacional avaliar(Usuario alvo, Instant agora) {
        var atual = ajustes.ler(alvo.id(), setores.habilitadaEmCache(), agora);
        var gestor = alcada.atual();
        boolean podeAlterar = gerenciavel(alvo)
                && (gestor.papel() != PapelUsuario.SUBGESTOR
                        || (!gestor.id().equals(alvo.id()) && alvo.papel() == PapelUsuario.ATENDENTE))
                && capacidades.permite("equipe.disponibilidade_ia");
        return PresencaOperacional.avaliar(alvo, atual.ajuste(), atual.validoAte(), atual.foraDoSetor(), podeAlterar);
    }

    static boolean gerenciavel(Usuario alvo) {
        return alvo.ativo() && !alvo.usuarioTeste() && alvo.papel().recebeAtendimento();
    }
}
