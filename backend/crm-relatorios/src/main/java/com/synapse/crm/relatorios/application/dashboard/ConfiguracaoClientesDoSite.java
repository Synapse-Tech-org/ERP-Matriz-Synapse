package com.synapse.crm.relatorios.application.dashboard;

import java.util.Arrays;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Atribuição opcional por mensagem recebida, configurada na instância. */
@Component
public class ConfiguracaoClientesDoSite {
    private final String padrao;

    public ConfiguracaoClientesDoSite(
            @Value("${synapse.dashboard.clientes-do-site.habilitado:false}") boolean habilitado,
            @Value("${synapse.dashboard.clientes-do-site.frase:}") String frase) {
        // Espaços são a única flexibilidade além da caixa. A frase do operador é literal,
        // inclusive quando contém pontuação que teria significado numa regex.
        String palavras = habilitado
                ? Arrays.stream(frase.split("(?U)\\s+"))
                        .filter(palavra -> !palavra.isEmpty())
                        .map(ConfiguracaoClientesDoSite::escaparLiteral)
                        .collect(Collectors.joining("[[:space:]]+"))
                : "";
        this.padrao = palavras.isEmpty() ? null : "^[[:space:]]*" + palavras + "[[:space:]]*$";
    }

    public String padrao() {
        return padrao;
    }

    private static String escaparLiteral(String palavra) {
        StringBuilder literal = new StringBuilder();
        for (char caractere : palavra.toCharArray()) {
            if ("\\.^$|?*+()[]{}".indexOf(caractere) >= 0) {
                literal.append('\\');
            }
            literal.append(caractere);
        }
        return literal.toString();
    }
}
