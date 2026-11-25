package com.synapse.crm.sharedkernel.midia;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.Set;

/** Classifica anexos dos canais externos a partir do MIME detectado e das trilhas do contêiner. */
public final class ClassificadorDeAnexoExterno {
    private static final Set<String> CONTEINER_ISO_BMFF = Set.of(
            "video/mp4", "video/quicktime", "video/3gpp", "audio/mp4");
    private static final Set<String> ALIASES_OGG_OPUS = Set.of("application/ogg", "audio/opus", "audio/x-opus+ogg");
    private static final String ALIAS_AAC_ADTS = "audio/x-aac";
    private static final Set<String> MARCAS_MP4 = Set.of(
            "isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "mmp4");
    private static final Set<String> MARCAS_3GP = Set.of("3gp4", "3gp5", "3gp6", "3gp7", "3gs7", "3g2a", "3g2b");

    private ClassificadorDeAnexoExterno() {}

    public record Classificacao(CategoriaDeMidia categoria, String mimeType) {}

    public static Optional<Classificacao> classificar(String mimeDetectado, byte[] conteudo) {
        if (mimeDetectado == null) {
            return Optional.empty();
        }
        if (ALIASES_OGG_OPUS.contains(mimeDetectado)) {
            if (!ValidadorDeOggOpus.ehValido(conteudo)) {
                return Optional.empty();
            }
            mimeDetectado = "audio/ogg";
        }
        if (ALIAS_AAC_ADTS.equals(mimeDetectado)) {
            if (!ehAacAdts(conteudo)) return Optional.empty();
            mimeDetectado = "audio/aac";
        }
        String mime = IsoBmffAudioOnly.mimetypeDeAudioSeCamuflado(mimeDetectado, conteudo);
        if (CONTEINER_ISO_BMFF.contains(mime) && IsoBmffAudioOnly.temTrilhaDeVideo(conteudo)) {
            String marca = IsoBmffAudioOnly.marcaPrincipal(conteudo);
            if (MARCAS_MP4.contains(marca)) {
                return Optional.of(new Classificacao(CategoriaDeMidia.VIDEO, "video/mp4"));
            }
            if (MARCAS_3GP.contains(marca)) {
                return Optional.of(new Classificacao(CategoriaDeMidia.VIDEO, "video/3gpp"));
            }
            return Optional.empty();
        }
        return RegrasDeAnexoBase.categoriaDe(mime).map(categoria -> new Classificacao(categoria, mime));
    }

    /** Recebe o spool já limitado pelo caso de uso. Só lê o binário completo se precisar inspecionar trilhas. */
    public static Optional<Classificacao> classificar(String mimeDetectado, Path arquivo) throws IOException {
        if (mimeDetectado == null || !precisaInspecionarConteudo(mimeDetectado)) {
            return classificar(mimeDetectado, (byte[]) null);
        }
        byte[] conteudo = Files.readAllBytes(arquivo);
        return classificar(mimeDetectado, conteudo).filter(classificacao -> switch (classificacao.mimeType()) {
            case "audio/mp4" -> IsoBmffAudioOnly.ehAudioSemVideo(conteudo);
            case "video/mp4", "video/3gpp" -> IsoBmffAudioOnly.ehVideoValido(conteudo);
            case "audio/ogg" -> ValidadorDeOggOpus.ehValido(conteudo);
            default -> true;
        });
    }

    private static boolean precisaInspecionarConteudo(String mime) {
        return CONTEINER_ISO_BMFF.contains(mime) || ALIASES_OGG_OPUS.contains(mime)
                || ALIAS_AAC_ADTS.equals(mime) || "audio/ogg".equals(mime);
    }

    /** Confere a sequência de quadros ADTS sem decodificar o áudio. */
    private static boolean ehAacAdts(byte[] conteudo) {
        if (conteudo == null || conteudo.length < 8) return false;
        int posicao = 0;
        while (posicao < conteudo.length) {
            int restante = conteudo.length - posicao;
            if (restante < 7 || (conteudo[posicao] & 0xff) != 0xff
                    || (conteudo[posicao + 1] & 0xf6) != 0xf0) return false;
            int frequencia = (conteudo[posicao + 2] & 0x3c) >>> 2;
            int cabecalho = (conteudo[posicao + 1] & 1) == 1 ? 7 : 9;
            int tamanho = ((conteudo[posicao + 3] & 3) << 11)
                    | ((conteudo[posicao + 4] & 0xff) << 3) | ((conteudo[posicao + 5] & 0xe0) >>> 5);
            if (frequencia > 12 || tamanho <= cabecalho || tamanho > restante) return false;
            posicao += tamanho;
        }
        return true;
    }

    /** Categoria de metadados persistidos depois de classificar os bytes. Não usar com MIME declarado. */
    public static Optional<CategoriaDeMidia> categoriaDoMimeValidado(String mimeType) {
        if (mimeType == null) {
            return Optional.empty();
        }
        return switch (mimeType) {
            case "video/mp4", "video/3gpp" -> Optional.of(CategoriaDeMidia.VIDEO);
            default -> RegrasDeAnexoBase.categoriaDe(mimeType);
        };
    }
}
