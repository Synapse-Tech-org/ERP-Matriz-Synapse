package com.synapse.crm.core.domain.arquivobanco;

public record PastaArquivoBanco(String id, String nome, boolean geral) {
    public static final String ID_GERAL = "geral";
}
