package com.synapse.crm.core.application.arquivobanco;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.synapse.crm.core.domain.arquivobanco.PastaArquivoBanco;

public interface PastaArquivoBancoRepositorio {
    List<PastaArquivoBanco> listar();

    boolean existe(String id);

    PastaArquivoBanco criar(UUID id, String nome);

    Optional<PastaArquivoBanco> renomear(UUID id, String nome);
}
