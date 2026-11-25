package com.synapse.crm.core.application.arquivobanco;

import java.time.Clock;
import java.time.Instant;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExpurgarArquivoBancoUseCase {
    private final ArquivoBancoRepositorio arquivos;
    private final ArmazenamentoArquivoBanco armazenamento;
    private final Clock relogio;

    public ExpurgarArquivoBancoUseCase(ArquivoBancoRepositorio arquivos, ArmazenamentoArquivoBanco armazenamento,
            Clock relogio) {
        this.arquivos = arquivos;
        this.armazenamento = armazenamento;
        this.relogio = relogio;
    }

    @Transactional
    public boolean executar() {
        var expirado = arquivos.expiradoParaRemover(Instant.now(relogio));
        if (expirado.isEmpty()) {
            return false;
        }
        var arquivo = expirado.orElseThrow();
        armazenamento.remover(arquivo.referencia());
        arquivos.removerExpirado(arquivo.metadados().id());
        return true;
    }
}
