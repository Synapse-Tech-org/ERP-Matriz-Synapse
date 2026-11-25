package com.synapse.crm.core.application.arquivobanco;

import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco;
import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;

@Service
public class ObterArquivoBancoUseCase {
    private final ArquivoBancoRepositorio arquivos;

    public ObterArquivoBancoUseCase(ArquivoBancoRepositorio arquivos) {
        this.arquivos = arquivos;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.ver')")
    public Metadados executar(UUID id) {
        return arquivos.ativo(id).map(ArquivoBanco::metadados).orElseThrow(FalhaArquivoBanco::naoEncontrado);
    }
}
