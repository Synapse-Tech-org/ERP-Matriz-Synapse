package com.synapse.crm.core.application.arquivobanco;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

@ConfigurationProperties("synapse.banco-arquivos")
public record BancoArquivosProperties(
        @DefaultValue("25MB") DataSize limiteArquivo,
        @DefaultValue("5GB") DataSize quota,
        @DefaultValue("1000") int limiteDescricao,
        @DefaultValue("15m") Duration janelaRestauracao) {

    public BancoArquivosProperties {
        if (limiteArquivo.toBytes() < 1 || limiteArquivo.toBytes() > DataSize.ofMegabytes(25).toBytes()
                || quota.toBytes() < limiteArquivo.toBytes() || limiteDescricao < 1
                || janelaRestauracao.isNegative() || janelaRestauracao.isZero()) {
            throw new IllegalArgumentException("Limites do Banco de Arquivos inválidos.");
        }
    }
}
