package com.synapse.crm.core.application.arquivobanco;

import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.domain.arquivobanco.PastaArquivoBanco;
import com.synapse.crm.sharedkernel.auditoria.Auditable;

@Service
public class RenomearPastaArquivoBancoUseCase {
    private final PastaArquivoBancoRepositorio pastas;

    public RenomearPastaArquivoBancoUseCase(PastaArquivoBancoRepositorio pastas) {
        this.pastas = pastas;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.gerenciar_pastas')")
    @Transactional
    @Auditable(acao = "RENOMEAR_PASTA_BANCO_ARQUIVOS", entidadeTipo = "PASTA_ARQUIVO_BANCO", capturarDados = false)
    public PastaArquivoBanco executar(String id, String nome) {
        String pastaId = EntradaArquivoBanco.pasta(id);
        if (PastaArquivoBanco.ID_GERAL.equals(pastaId)) {
            throw new FalhaArquivoBanco(FalhaArquivoBanco.Motivo.PASTA_GERAL_PERMANENTE,
                    "A pasta Geral é permanente.");
        }
        return pastas.renomear(UUID.fromString(pastaId), EntradaArquivoBanco.nomeDePasta(nome))
                .orElseThrow(FalhaArquivoBanco::pastaNaoEncontrada);
    }
}
