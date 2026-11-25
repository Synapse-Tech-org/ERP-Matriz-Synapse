package com.synapse.crm.equipe.infrastructure.seguranca;

import java.time.Duration;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("synapse.banco-arquivos.limites-requisicoes")
record LimitesDeRequisicoesDoBancoProperties(
        @NotNull @DurationMin(seconds = 1) Duration janela,
        @NotNull @DurationMin(millis = 1) Duration timeoutRedis,
        @Positive int threadsRedis,
        @Positive int filaRedis,
        @NotNull DataSize tamanhoUpload,
        @NotNull DataSize tamanhoJson,
        @Positive int uploadsSimultaneos,
        @Positive int downloadsSimultaneos,
        @Positive int miniaturasSimultaneas,
        @Positive int enviosSimultaneos,
        @Valid @NotNull Cota leitura,
        @Valid @NotNull Cota download,
        @Valid @NotNull Cota miniatura,
        @Valid @NotNull Cota upload,
        @Valid @NotNull Cota escrita) {

    record Cota(@Positive int usuario, @Positive int instancia) {
        Cota {
            if (instancia < usuario) {
                throw new IllegalArgumentException("A cota da instância deve cobrir a cota individual.");
            }
        }
    }
}
