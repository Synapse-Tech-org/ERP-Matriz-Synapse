package com.synapse.crm.core.application.arquivobanco;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;
import com.synapse.crm.sharedkernel.auditoria.Auditable;

@Service
public class RestaurarArquivoBancoUseCase {
    private final ArquivoBancoRepositorio arquivos;
    private final Clock relogio;

    public RestaurarArquivoBancoUseCase(ArquivoBancoRepositorio arquivos, Clock relogio) {
        this.arquivos = arquivos;
        this.relogio = relogio;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.excluir')")
    @Transactional
    @Auditable(acao = "RESTAURAR_ARQUIVO_BANCO", entidadeTipo = "ARQUIVO_BANCO", capturarDados = false)
    public Metadados executar(UUID id) {
        return arquivos.restaurar(id, Instant.now(relogio)).orElseThrow(FalhaArquivoBanco::naoEncontrado);
    }
}
