package com.synapse.crm.core.application.mensagemrapida;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.synapse.crm.core.domain.mensagemrapida.MensagemRapida;

public interface MensagemRapidaRepositorio {
    List<MensagemRapida> listar(EscopoMensagensRapidas escopo, boolean incluirGerais);
    MensagemRapida criar(UUID atendenteId, String palavraChave, String conteudo, boolean geral);
    Optional<MensagemRapida> atualizar(
            UUID id, EscopoMensagensRapidas escopo, String palavraChave, String conteudo, Boolean geral);
    boolean remover(UUID id,EscopoMensagensRapidas escopo);
}
