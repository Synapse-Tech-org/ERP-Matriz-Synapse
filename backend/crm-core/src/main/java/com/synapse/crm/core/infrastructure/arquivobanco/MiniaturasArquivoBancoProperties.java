package com.synapse.crm.core.infrastructure.arquivobanco;

import java.time.Duration;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("synapse.banco-arquivos.miniaturas")
record MiniaturasArquivoBancoProperties(
        @NotNull DataSize tamanhoEntrada,
        @Positive int ladoSaida,
        @Positive long pixelsImagem,
        @Positive int paginasPdf,
        @Positive int ladoPdfPontos,
        @Positive int operadoresPdf,
        @Positive int operandosPorOperadorPdf,
        @Positive long pixelsEmbutidosPdf,
        @NotNull DataSize memoriaPdf,
        @NotNull DataSize armazenamentoTemporarioPdf,
        @Positive int trabalhadores,
        @Positive int fila,
        @NotNull @DurationMin(millis = 1) Duration prazo) {
    MiniaturasArquivoBancoProperties {
        if (tamanhoEntrada.toBytes() <= 0 || tamanhoEntrada.toBytes() >= Integer.MAX_VALUE
                || memoriaPdf.toBytes() <= 0 || armazenamentoTemporarioPdf.toBytes() < memoriaPdf.toBytes()) {
            throw new IllegalArgumentException("Orçamentos inválidos de miniatura do Banco de Arquivos.");
        }
    }
}
