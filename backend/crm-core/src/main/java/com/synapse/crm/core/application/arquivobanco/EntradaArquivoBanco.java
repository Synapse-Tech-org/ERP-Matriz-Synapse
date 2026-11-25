package com.synapse.crm.core.application.arquivobanco;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

import com.synapse.crm.core.domain.arquivobanco.PastaArquivoBanco;

final class EntradaArquivoBanco {
    private static final Pattern UUID_CANONICO = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    private EntradaArquivoBanco() {}

    static String pasta(String valor) {
        if (valor == null || (!PastaArquivoBanco.ID_GERAL.equals(valor) && !UUID_CANONICO.matcher(valor).matches())) {
            throw invalida("Pasta inválida.");
        }
        return valor;
    }

    static String pastaExistente(String valor, PastaArquivoBancoRepositorio pastas) {
        String id = pasta(valor);
        if (!pastas.existe(id)) {
            throw FalhaArquivoBanco.pastaNaoEncontrada();
        }
        return id;
    }

    static String nomeDePasta(String valor) {
        if (valor == null) {
            throw invalida("Informe o nome da pasta.");
        }
        String nome = Normalizer.normalize(valor.strip(), Normalizer.Form.NFC);
        if (nome.isBlank() || nome.codePointCount(0, nome.length()) > 80 || nome.equals(".") || nome.equals("..")
                || nome.codePoints().anyMatch(EntradaArquivoBanco::invalidoNoNome)) {
            throw invalida("Nome de pasta inválido.");
        }
        if (PastaArquivoBanco.ID_GERAL.equalsIgnoreCase(nome)) {
            throw FalhaArquivoBanco.nomeDePastaEmUso();
        }
        return nome;
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
