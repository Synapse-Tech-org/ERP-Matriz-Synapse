package com.synapse.crm.app.atendimento;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.synapse.crm.app.saude.application.ExpedienteDaInstancia;
import com.synapse.crm.atendimento.application.FinalizarAtendimentosNoFimDoExpedienteUseCase;
import com.synapse.crm.automacaoconfig.application.ConfiguracaoAutomacaoRepositorio;
import com.synapse.crm.automacaoconfig.domain.ConfiguracaoAutomacao;
import com.synapse.crm.sharedkernel.identidade.ContextoDeServico;

/**
 * Finaliza os atendimentos humanos abertos uma vez por dia, no fim do expediente (Gestão › Configurações
 * gerais). Desligado por padrão.
 *
 * <p>O horário é o fim da janela de expediente do dia ({@code alerta.horario_cliente.*}, com a faixa e o
 * "fechado" de cada dia) ou um horário fixo escolhido na tela. Verifica a cada minuto; quando passa do
 * horário, reserva o dia e roda uma vez. Só age até {@link #TOLERANCIA} depois do horário: ligar o toggle
 * à noite, ou o backend voltar de madrugada, não encerra retroativamente o dia de ninguém.
 */
@Component
public class AgendadorDeFinalizacaoNoFimDoExpediente {

    static final String CHAVE_HABILITADO = "atendimento.finalizar_fim_expediente.habilitado";
    static final String CHAVE_USAR_EXPEDIENTE = "atendimento.finalizar_fim_expediente.usar_expediente";
    static final String CHAVE_HORARIO = "atendimento.finalizar_fim_expediente.horario";
    static final Duration TOLERANCIA = Duration.ofHours(2);

    private static final Logger log = LoggerFactory.getLogger(AgendadorDeFinalizacaoNoFimDoExpediente.class);

    private final ConfiguracaoAutomacaoRepositorio configuracoes;
    private final ExpedienteDaInstancia expediente;
    private final FinalizarAtendimentosNoFimDoExpedienteUseCase finalizar;
    private final ExecucoesDaFinalizacaoNoFimDoExpediente execucoes;
    private final FinalizacaoAtendimentoInativoProperties propriedades;
    private final ZoneId fuso;
    private final Clock relogio;

    AgendadorDeFinalizacaoNoFimDoExpediente(
            ConfiguracaoAutomacaoRepositorio configuracoes,
            ExpedienteDaInstancia expediente,
            FinalizarAtendimentosNoFimDoExpedienteUseCase finalizar,
            ExecucoesDaFinalizacaoNoFimDoExpediente execucoes,
            FinalizacaoAtendimentoInativoProperties propriedades,
            ZoneId fusoDoTenant,
            Clock relogio) {
        this.configuracoes = configuracoes;
        this.expediente = expediente;
        this.finalizar = finalizar;
        this.execucoes = execucoes;
        this.propriedades = propriedades;
        this.fuso = fusoDoTenant;
        this.relogio = relogio;
    }

    @Scheduled(fixedDelayString = "${synapse.atendimento.finalizar-fim-expediente.intervalo-ms:60000}")
    public void verificar() {
        ContextoDeServico.executarComo("finalizador-fim-do-expediente", this::executarSeForAHora);
    }

    private void executarSeForAHora() {
        if (!ligado(CHAVE_HABILITADO, false)) {
            return;
        }
        Instant agora = Instant.now(relogio);
        LocalDate hoje = agora.atZone(fuso).toLocalDate();
        Optional<LocalTime> horario = horarioDeCorte(hoje);
        if (horario.isEmpty()) {
            return;
        }
        Instant corte = hoje.atTime(horario.get()).atZone(fuso).toInstant();
        if (agora.isBefore(corte) || agora.isAfter(corte.plus(TOLERANCIA))) {
            return;
        }
        if (!execucoes.reservar(hoje, agora)) {
            return;
        }
        var resultado = finalizar.executar(corte, propriedades.lote());
        execucoes.concluir(hoje, Instant.now(relogio), resultado);
        log.info(
                "Finalização do fim do expediente de {}: corte={}, finalizados={}, ignorados={}, falhas={}",
                hoje, corte, resultado.finalizados(), resultado.ignorados(), resultado.falhas());
    }

    /** Vazio = não roda hoje: dia fechado, sem expediente configurado ou horário fixo ilegível. */
    private Optional<LocalTime> horarioDeCorte(LocalDate hoje) {
        if (ligado(CHAVE_USAR_EXPEDIENTE, true)) {
            return expediente.fimDoExpediente(hoje);
        }
        Optional<String> fixo = configuracoes.porChave(CHAVE_HORARIO).map(ConfiguracaoAutomacao::valor);
        if (fixo.isEmpty()) {
            log.error("{} parâmetro {} não encontrado; finalização do fim do expediente não executada",
                    "[ALERTA_CONFIG_AUTOMACAO]", CHAVE_HORARIO);
            return Optional.empty();
        }
        try {
            return Optional.of(LocalTime.parse(fixo.get().strip()));
        } catch (DateTimeParseException erro) {
            log.error("{} parâmetro {} inválido (esperado HH:mm); finalização do fim do expediente não executada",
                    "[ALERTA_CONFIG_AUTOMACAO]", CHAVE_HORARIO);
            return Optional.empty();
        }
    }

    private boolean ligado(String chave, boolean seAusente) {
        return configuracoes.porChave(chave)
                .map(configuracao -> "true".equalsIgnoreCase(configuracao.valor().strip()))
                .orElse(seAusente);
    }
}
