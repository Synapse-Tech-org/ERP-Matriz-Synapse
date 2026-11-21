package com.synapse.crm.core.application.arquivobanco;

public class FalhaArquivoBanco extends RuntimeException {
    public enum Motivo {
        ENTRADA_INVALIDA, FORMATO_INVALIDO, LIMITE_ARQUIVO, QUOTA, NAO_ENCONTRADO, INDISPONIVEL
    }

    private final Motivo motivo;

    public FalhaArquivoBanco(Motivo motivo, String mensagem) {
        super(mensagem);
        this.motivo = motivo;
    }

    public FalhaArquivoBanco(Motivo motivo, String mensagem, Throwable causa) {
        super(mensagem, causa);
        this.motivo = motivo;
    }

    public Motivo motivo() {
        return motivo;
    }

    public static FalhaArquivoBanco naoEncontrado() {
        return new FalhaArquivoBanco(Motivo.NAO_ENCONTRADO, "Arquivo indisponível.");
    }
}
