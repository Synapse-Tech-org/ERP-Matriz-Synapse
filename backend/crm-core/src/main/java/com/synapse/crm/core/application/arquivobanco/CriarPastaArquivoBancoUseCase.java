package com.synapse.crm.core.application.arquivobanco;

import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.domain.arquivobanco.PastaArquivoBanco;
import com.synapse.crm.sharedkernel.auditoria.Auditable;

@Service
public class CriarPastaArquivoBancoUseCase {
    private final PastaArquivoBancoRepositorio pastas;

    public CriarPastaArquivoBancoUseCase(PastaArquivoBancoRepositorio pastas) {
        this.pastas = pastas;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.gerenciar_pastas')")
    @Transactional
    @Auditable(acao = "CRIAR_PASTA_BANCO_ARQUIVOS", entidadeTipo = "PASTA_ARQUIVO_BANCO", capturarDados = false)
    public PastaArquivoBanco executar(UUID id, String nome) {
        return pastas.criar(id, EntradaArquivoBanco.nomeDePasta(nome));
    }
}
