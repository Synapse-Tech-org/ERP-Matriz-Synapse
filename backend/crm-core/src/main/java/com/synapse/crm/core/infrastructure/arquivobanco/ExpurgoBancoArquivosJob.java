package com.synapse.crm.core.infrastructure.arquivobanco;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.synapse.crm.core.application.arquivobanco.ExpurgarArquivoBancoUseCase;
import com.synapse.crm.sharedkernel.permissao.ConsultaDeFuncionalidades;

@Component
class ExpurgoBancoArquivosJob {
    private final ExpurgarArquivoBancoUseCase expurgo;
    private final ConsultaDeFuncionalidades funcionalidades;
    private final int tamanhoLote;

    ExpurgoBancoArquivosJob(ExpurgarArquivoBancoUseCase expurgo, ConsultaDeFuncionalidades funcionalidades,
            @Value("${synapse.banco-arquivos.expurgo-tamanho-lote:20}") int tamanhoLote) {
        this.expurgo = expurgo;
        this.funcionalidades = funcionalidades;
        this.tamanhoLote = tamanhoLote;
    }

    @Scheduled(fixedDelayString = "${synapse.banco-arquivos.expurgo-intervalo:PT1M}",
            initialDelayString = "${synapse.banco-arquivos.expurgo-intervalo:PT1M}")
    void limpar() {
        if (!funcionalidades.habilitadas().contains("banco_arquivos")) {
            return;
        }
        for (int removidos = 0; removidos < tamanhoLote && expurgo.executar(); removidos++) {
            // Uma transação por objeto para não segurar todos os locks durante I/O.
        }
    }
}
