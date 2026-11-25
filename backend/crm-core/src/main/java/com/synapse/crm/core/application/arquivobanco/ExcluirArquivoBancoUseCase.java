package com.synapse.crm.core.application.arquivobanco;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.sharedkernel.auditoria.Auditable;

@Service
public class ExcluirArquivoBancoUseCase {
    private final ArquivoBancoRepositorio arquivos;
    private final BancoArquivosProperties limites;
    private final Clock relogio;

    public ExcluirArquivoBancoUseCase(ArquivoBancoRepositorio arquivos, BancoArquivosProperties limites, Clock relogio) {
        this.arquivos = arquivos;
        this.limites = limites;
        this.relogio = relogio;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.excluir')")
    @Transactional
    @Auditable(acao = "EXCLUIR_ARQUIVO_BANCO", entidadeTipo = "ARQUIVO_BANCO", capturarDados = false)
    public void executar(UUID id) {
        Instant expiraEm = Instant.now(relogio).plus(limites.janelaRestauracao());
        if (!arquivos.excluir(id, expiraEm)) {
            throw FalhaArquivoBanco.naoEncontrado();
        }
    }
}
