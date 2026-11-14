package com.synapse.crm.equipe.domain.feedback;

import java.util.Arrays;
import java.util.HexFormat;

public record AnexoFeedback(String nome, String tipo, byte[] conteudo) {
    public static final int LIMITE_BYTES = 5 * 1024 * 1024;
    private static final byte[] PNG = HexFormat.of().parseHex("89504e470d0a1a0a");
    private static final byte[] JPEG = HexFormat.of().parseHex("ffd8ff");

    public static AnexoFeedback de(String nome, byte[] conteudo) {
        if (conteudo.length == 0 || conteudo.length > LIMITE_BYTES) {
            throw new FeedbackInvalidoException("O print deve ter até 5 MB.");
        }
        String tipo;
        if (comecaCom(conteudo, PNG)) {
            tipo = "image/png";
        } else if (comecaCom(conteudo, JPEG)) {
            tipo = "image/jpeg";
        } else {
            throw new FeedbackInvalidoException("Anexe um print no formato PNG ou JPG.");
        }
        String seguro = nome == null ? "" : nome.replace('\\', '/');
        seguro = seguro.substring(seguro.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").strip();
        int ponto = seguro.lastIndexOf('.');
        String base = ponto > 0 ? seguro.substring(0, ponto) : seguro;
        String extensao = tipo.equals("image/png") ? ".png" : ".jpg";
        seguro = (base.isBlank() || base.length() > 196 ? "print" : base) + extensao;
        return new AnexoFeedback(seguro, tipo, conteudo);
    }

    private static boolean comecaCom(byte[] conteudo, byte[] assinatura) {
        return conteudo.length > assinatura.length
                && Arrays.equals(conteudo, 0, assinatura.length, assinatura, 0, assinatura.length);
    }
}
