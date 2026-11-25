package com.synapse.crm.core.application.arquivobanco;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

final class EntradaArquivoBanco {
    private static final Set<String> PASTAS = Set.of(
            "catalogos", "tabelas", "contratos", "projetos", "orcamentos", "fotos");

    private EntradaArquivoBanco() {}

    static String pasta(String valor) {
        if (valor == null || !PASTAS.contains(valor)) {
            throw invalida("Pasta inválida.");
        }
        return valor;
    }

    static String nome(String valor) {
        if (valor == null) {
            throw invalida("Informe o nome do arquivo.");
        }
        String nome = Normalizer.normalize(valor.strip(), Normalizer.Form.NFC);
        int separador = nome.lastIndexOf('.');
        if (nome.length() > 200 || nome.startsWith(".") || separador <= 0
                || separador == nome.length() - 1 || nome.codePoints().anyMatch(EntradaArquivoBanco::invalidoNoNome)) {
            throw invalida("Nome de arquivo inválido.");
        }
        return nome;
    }

    static String extensao(String nome) {
        return nome.substring(nome.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
    }

    static String descricao(String valor, int limite) {
        String descricao = valor == null ? "" : valor.strip();
        if (descricao.length() > limite || descricao.codePoints().anyMatch(c -> c == 0)) {
            throw invalida("Descrição inválida.");
        }
        return descricao;
    }

    static FalhaArquivoBanco invalida(String mensagem) {
        return new FalhaArquivoBanco(FalhaArquivoBanco.Motivo.ENTRADA_INVALIDA, mensagem);
    }

    private static boolean invalidoNoNome(int codigo) {
        int classe = Character.getType(codigo);
        return "<>:\"/\\|?*".indexOf(codigo) >= 0 || classe == Character.CONTROL || classe == Character.FORMAT
                || classe == Character.LINE_SEPARATOR || classe == Character.PARAGRAPH_SEPARATOR
                || classe == Character.SURROGATE;
    }
}
