package com.synapse.crm.core.domain.arquivobanco;

import java.time.Instant;
import java.util.UUID;

public record ArquivoBanco(Metadados metadados, String referencia) {

    public record Metadados(
            UUID id,
            String nome,
            String pasta,
            TipoArquivoBanco tipo,
            String mimeType,
            long tamanhoBytes,
            String descricao,
            Instant criadoEm) {}
}
