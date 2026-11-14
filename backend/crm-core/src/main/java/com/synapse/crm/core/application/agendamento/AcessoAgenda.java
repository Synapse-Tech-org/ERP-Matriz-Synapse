package com.synapse.crm.core.application.agendamento;

final class AcessoAgenda {
    static final String LER = "hasAnyRole('ATENDENTE','OPERADOR','SUBGESTOR','GESTOR','ADMINISTRADOR')"
            + " and @featureService.habilitadas().contains('variante_clinica') and @capacidades.permite('clientes.acessar')";
    static final String EDITAR = LER + " and @capacidades.permite('contatos.editar')";

    private AcessoAgenda() {}
}
