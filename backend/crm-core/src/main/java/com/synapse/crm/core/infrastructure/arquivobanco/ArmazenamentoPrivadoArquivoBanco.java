package com.synapse.crm.core.infrastructure.arquivobanco;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.function.Supplier;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.synapse.crm.core.application.arquivobanco.ArmazenamentoArquivoBanco;
import com.synapse.crm.core.application.arquivobanco.FalhaArquivoBanco;
import com.synapse.crm.sharedkernel.midia.ArmazenamentoDeMidia;

@Component
class ArmazenamentoPrivadoArquivoBanco implements ArmazenamentoArquivoBanco {
    private static final Logger log = LoggerFactory.getLogger(ArmazenamentoPrivadoArquivoBanco.class);

    private final ArmazenamentoDeMidia storage;
    private final CircuitBreaker circuito;

    ArmazenamentoPrivadoArquivoBanco(ArmazenamentoDeMidia storage, CircuitBreakerRegistry circuitos) {
        this.storage = storage;
        this.circuito = circuitos.circuitBreaker("banco-arquivos-storage");
    }

    @Override
    public String gravar(Path arquivo, long tamanho, String nome, String mimeType) {
        try (InputStream conteudo = Files.newInputStream(arquivo)) {
            return executar(() -> storage.salvar(conteudo, tamanho, nome, mimeType));
        } catch (IOException erro) {
            throw indisponivel(erro);
        }
    }

    @Override
    public InputStream abrir(String referencia) {
        return executar(() -> storage.abrirLeitura(referencia));
    }

    @Override
    public void remover(String referencia) {
        try {
            circuito.executeRunnable(() -> storage.remover(referencia));
        } catch (RuntimeException erro) {
            throw indisponivel(erro);
        }
    }

    private <T> T executar(Supplier<T> operacao) {
        try {
            return circuito.executeSupplier(operacao);
        } catch (RuntimeException erro) {
            throw indisponivel(erro);
        }
    }

    private static FalhaArquivoBanco indisponivel(Exception erro) {
        log.warn("Operação no armazenamento privado do Banco de Arquivos falhou: {}", erro.getClass().getSimpleName());
        return new FalhaArquivoBanco(FalhaArquivoBanco.Motivo.INDISPONIVEL,
                "Armazenamento temporariamente indisponível.", erro);
    }
}
