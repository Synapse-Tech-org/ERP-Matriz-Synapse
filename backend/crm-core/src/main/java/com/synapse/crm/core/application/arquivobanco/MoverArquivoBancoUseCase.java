package com.synapse.crm.core.application.arquivobanco;

import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;
import com.synapse.crm.sharedkernel.auditoria.Auditable;

@Service
public class MoverArquivoBancoUseCase {
    private final ArquivoBancoRepositorio arquivos;
    private final PastaArquivoBancoRepositorio pastas;

    public MoverArquivoBancoUseCase(ArquivoBancoRepositorio arquivos, PastaArquivoBancoRepositorio pastas) {
        this.arquivos = arquivos;
        this.pastas = pastas;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.editar')")
    @Transactional
    @Auditable(acao = "MOVER_ARQUIVO_BANCO", entidadeTipo = "ARQUIVO_BANCO", capturarDados = false)
    public Metadados executar(UUID id, String pasta) {
        String destino = EntradaArquivoBanco.pastaExistente(pasta, pastas);
        return arquivos.mover(id, destino).orElseThrow(FalhaArquivoBanco::naoEncontrado);
    }
}
