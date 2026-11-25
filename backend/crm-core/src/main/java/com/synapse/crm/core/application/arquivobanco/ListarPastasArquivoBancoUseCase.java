package com.synapse.crm.core.application.arquivobanco;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.domain.arquivobanco.PastaArquivoBanco;

@Service
public class ListarPastasArquivoBancoUseCase {
    private final PastaArquivoBancoRepositorio pastas;

    public ListarPastasArquivoBancoUseCase(PastaArquivoBancoRepositorio pastas) {
        this.pastas = pastas;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.ver')")
    @Transactional(readOnly = true)
    public List<PastaArquivoBanco> executar() {
        return pastas.listar();
    }
}
