package com.synapse.crm.atendimento.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import com.synapse.crm.atendimento.domain.atendimento.AtendimentoJaFinalizadoException;

/**
 * Finaliza, de uma vez, os atendimentos humanos sem atividade desde o fim do expediente.
 *
 * <p>Reaproveita a seleção do job de inatividade com o corte no horário do expediente: quem trocou
 * mensagem depois dele continua aberto. Percorre lotes curtos, cada atendimento em sua transação, até
 * acabar a lista. Os ignorados (negociação sem resultado, mudança concorrente) voltam no topo da próxima
 * leitura; por isso um lote sem nenhuma finalização encerra a rodada em vez de girar sobre eles.
 */
@Service
public class FinalizarAtendimentosNoFimDoExpedienteUseCase {

    /** Teto de lotes por rodada; com o lote padrão de 50, cobre 10 mil atendimentos abertos. */
    static final int MAXIMO_DE_LOTES = 200;

    private static final Logger log = LoggerFactory.getLogger(FinalizarAtendimentosNoFimDoExpedienteUseCase.class);

    private final ListarAtendimentosInativosUseCase listar;
    private final FinalizarAtendimentoUseCase finalizar;

    public FinalizarAtendimentosNoFimDoExpedienteUseCase(
            ListarAtendimentosInativosUseCase listar, FinalizarAtendimentoUseCase finalizar) {
        this.listar = listar;
        this.finalizar = finalizar;
    }

    @PreAuthorize("hasRole('SERVICO')")
    public Resultado executar(Instant corte, int lote) {
        int finalizados = 0;
        int ignorados = 0;
        int falhas = 0;
        for (int rodada = 0; rodada < MAXIMO_DE_LOTES; rodada++) {
            List<UUID> ids = listar.executar(corte, lote);
            int finalizadosNoLote = 0;
            for (UUID id : ids) {
                try {
                    if (finalizar.executarNoFimDoExpediente(id, corte).isPresent()) {
                        finalizadosNoLote++;
                    } else {
                        ignorados++;
                    }
                } catch (AtendimentoJaFinalizadoException | RecursoDeAtendimentoIndisponivelException erro) {
                    ignorados++;
                } catch (RuntimeException erro) {
                    falhas++;
                    log.warn("Falha ao finalizar o atendimento {} no fim do expediente", id, erro);
                }
            }
            finalizados += finalizadosNoLote;
            if (ids.size() < lote || finalizadosNoLote == 0) {
                break;
            }
        }
        return new Resultado(finalizados, ignorados, falhas);
    }

    public record Resultado(int finalizados, int ignorados, int falhas) {}
}
