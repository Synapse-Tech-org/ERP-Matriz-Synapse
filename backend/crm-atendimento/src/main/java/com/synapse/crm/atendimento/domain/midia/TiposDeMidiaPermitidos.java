package com.synapse.crm.atendimento.domain.midia;

import java.util.Map;
import java.util.Optional;

import com.synapse.crm.atendimento.domain.mensagem.TipoMensagem;
import com.synapse.crm.sharedkernel.midia.CategoriaDeMidia;
import com.synapse.crm.sharedkernel.midia.ClassificadorDeAnexoExterno;
import com.synapse.crm.sharedkernel.midia.RegrasDeAnexoBase;

/**
 * Mapeador local de mimetypes para TipoMensagem do atendimento, e os tetos de tamanho da Meta Cloud API
 * usados como fallback quando ninguem configurou um limite em {@code configuracao_automacao}.
 *
 * <p>Video (E215) so existe aqui, no envio do atendimento: a Meta aceita {@code video/mp4} e
 * {@code video/3gpp} ate 16 MB; a Uzapi documenta {@code type: video} sem publicar MIME nem teto, e
 * o CRM aplica a ela o mesmo recorte. Chat interno, logo e foto nao passam por esta classe.
 */
public final class TiposDeMidiaPermitidos {

    private static final Map<TipoMensagem, Long> TETO_DA_META_EM_BYTES = Map.of(
            TipoMensagem.IMAGEM, 5L * 1024 * 1024,
            TipoMensagem.AUDIO, 16L * 1024 * 1024,
            TipoMensagem.DOCUMENTO, 100L * 1024 * 1024,
            TipoMensagem.VIDEO, 16L * 1024 * 1024);

    private TiposDeMidiaPermitidos() {}

    /** Resultado da classificacao pelo conteudo: o tipo da mensagem e o mimetype que vai ao provedor. */
    public record Classificacao(TipoMensagem tipo, String mimetype) {}

    /**
     * Classifica pelo conteudo real, nunca pela extensao ou pelo Content-Type do navegador.
     *
     * <p>Conteiner com trilha de video so vira {@code VIDEO} se a marca for MP4 ou 3GP; qualquer outra
     * marca com video e recusada — inclusive {@code M4A } (video disfarcado de audio) e {@code qt  }
     * (.mov, que a Meta nao aceita). Conteiner sem trilha de video segue o caminho de audio de antes.
     */
    public static Optional<Classificacao> classificar(String mimetypeDetectado, byte[] conteudo) {
        return ClassificadorDeAnexoExterno.classificar(mimetypeDetectado, conteudo)
                .map(resultado -> new Classificacao(tipoDaCategoria(resultado.categoria()), resultado.mimeType()));
    }

    /** Vazio quando o mimetype real nao esta na allowlist da base. Nunca devolve video. */
    public static Optional<TipoMensagem> tipoDe(String mimetypeReal) {
        return RegrasDeAnexoBase.categoriaDe(mimetypeReal).map(TiposDeMidiaPermitidos::tipoDaCategoria);
    }

    private static TipoMensagem tipoDaCategoria(CategoriaDeMidia categoria) {
        return switch (categoria) {
            case IMAGEM -> TipoMensagem.IMAGEM;
            case AUDIO -> TipoMensagem.AUDIO;
            case DOCUMENTO -> TipoMensagem.DOCUMENTO;
            case VIDEO -> TipoMensagem.VIDEO;
        };
    }

    public static long tetoDaMetaEmBytes(TipoMensagem tipo) {
        Long teto = TETO_DA_META_EM_BYTES.get(tipo);
        if (teto == null) {
            throw new IllegalArgumentException(tipo + " nao e um tipo de midia com teto conhecido");
        }
        return teto;
    }

    public static long tetoDaMetaEmBytes(CategoriaDeMidia categoria) {
        return tetoDaMetaEmBytes(tipoDaCategoria(categoria));
    }
}
