package com.synapse.crm.equipe.application.feedback;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.synapse.crm.equipe.domain.feedback.AnexoFeedback;
import com.synapse.crm.equipe.domain.feedback.Feedback;
import com.synapse.crm.equipe.domain.feedback.TipoFeedback;
import com.synapse.crm.sharedkernel.identidade.PapelUsuario;

public interface FeedbackRepositorio {
    Feedback salvar(Feedback feedback, AnexoFeedback anexo);

    java.util.Optional<AnexoFeedback> obterAnexo(UUID id, UUID usuarioId, boolean administrador);

    Pagina listar(TipoFeedback tipo, Instant antesDe, UUID antesDoId, int limite);

    Pagina listarDoAutor(UUID autorId, Instant antesDe, UUID antesDoId, int limite);

    boolean responder(UUID id, String resposta, Instant respondidoEm);

    record FeedbackResumo(UUID id, UUID autorId, String autorNome, PapelUsuario autorPapel,
            String autorFotoUrl, TipoFeedback tipo, String areaChave, String descricao,
            Instant criadoEm, String resposta, Instant respondidoEm, String anexoNome) {}

    record Pagina(List<FeedbackResumo> itens, Instant proximoCriadoEm, UUID proximoId) {}
}
