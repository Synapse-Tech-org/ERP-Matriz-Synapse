package com.synapse.crm.equipe.application.usuario;

public class ValidadeDePresencaOperacionalInvalidaException extends RuntimeException {
    public ValidadeDePresencaOperacionalInvalidaException() {
        super("A validade deve estar no futuro e ser inequívoca no fuso da instância.");
    }
}
