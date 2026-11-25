package com.synapse.crm.atendimento.infrastructure.midia;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Path;

import org.apache.poi.poifs.filesystem.DirectoryNode;
import org.apache.poi.poifs.filesystem.DocumentEntry;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;

/** Classifica contêineres OLE pelos streams e cabeçalhos próprios de Word, Excel e PowerPoint. */
final class DetectorDeDocumentoOfficeBinario {
    private static final String OLE_GENERICO = "application/x-tika-msoffice";
    private static final String XLS = "application/vnd.ms-excel";
    private static final String PPT = "application/vnd.ms-powerpoint";
    private static final String DOCUMENTO_POWERPOINT = "PowerPoint Document";
    private static final String USUARIO_ATUAL = "Current User";

    private DetectorDeDocumentoOfficeBinario() {}

    static String detectar(Path arquivo) {
        try (var fs = new POIFSFileSystem(arquivo.toFile(), true)) {
            DirectoryNode raiz = fs.getRoot();
            boolean word = raiz.hasEntry("WordDocument");
            boolean excel = raiz.hasEntry("Workbook") || raiz.hasEntry("Book");
            boolean powerPoint = raiz.hasEntry(DOCUMENTO_POWERPOINT) || raiz.hasEntry(USUARIO_ATUAL);
            if ((word ? 1 : 0) + (excel ? 1 : 0) + (powerPoint ? 1 : 0) != 1) {
                return OLE_GENERICO;
            }
            if (word && DetectorDeDocumentoWord.docValido(raiz)) return DetectorDeDocumentoWord.DOC;
            if (excel && planilhaValida(raiz)) return XLS;
            if (powerPoint && apresentacaoValida(raiz)) return PPT;
        } catch (IOException | RuntimeException invalido) {
            return OLE_GENERICO;
        }
        return OLE_GENERICO;
    }

    private static boolean planilhaValida(DirectoryNode raiz) throws IOException {
        String nome = raiz.hasEntry("Workbook") ? "Workbook" : "Book";
        if (!(raiz.getEntry(nome) instanceof DocumentEntry planilha)) return false;
        try (var entrada = raiz.createDocumentInputStream(nome)) {
            ByteBuffer bof = ler(entrada, 8);
            if (bof == null || Short.toUnsignedInt(bof.getShort()) != 0x0809) return false;
            int tamanhoRegistro = Short.toUnsignedInt(bof.getShort());
            int versao = Short.toUnsignedInt(bof.getShort());
            return tamanhoRegistro >= 8 && tamanhoRegistro <= planilha.getSize() - 4
                    && (versao == 0x0500 || versao == 0x0600) && bof.getShort() == 0x0005;
        }
    }

    private static boolean apresentacaoValida(DirectoryNode raiz) throws IOException {
        if (!(raiz.getEntry(DOCUMENTO_POWERPOINT) instanceof DocumentEntry slides)
                || !(raiz.getEntry(USUARIO_ATUAL) instanceof DocumentEntry usuario)) return false;
        long posicaoEdicao;
        try (var entrada = raiz.createDocumentInputStream(USUARIO_ATUAL)) {
            ByteBuffer registro = ler(entrada, 20);
            if (registro == null || Short.toUnsignedInt(registro.getShort(2)) != 0x0ff6
                    || registro.getInt(8) != 0x14 || registro.getInt(12) != 0xe391c05f) return false;
            long tamanho = Integer.toUnsignedLong(registro.getInt(4));
            if (tamanho < 20 || tamanho > usuario.getSize() - 8L) return false;
            posicaoEdicao = Integer.toUnsignedLong(registro.getInt(16));
        }
        if (posicaoEdicao > slides.getSize() - 8L) return false;
        try (var entrada = raiz.createDocumentInputStream(DOCUMENTO_POWERPOINT)) {
            entrada.skipNBytes(posicaoEdicao);
            ByteBuffer edicao = ler(entrada, 8);
            if (edicao == null || Short.toUnsignedInt(edicao.getShort(2)) != 0x0ff5) return false;
            long tamanho = Integer.toUnsignedLong(edicao.getInt(4));
            return (tamanho == 28 || tamanho == 32) && tamanho <= slides.getSize() - posicaoEdicao - 8;
        }
    }

    private static ByteBuffer ler(DocumentInputStream entrada, int tamanho) throws IOException {
        byte[] bytes = entrada.readNBytes(tamanho);
        return bytes.length == tamanho ? ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN) : null;
    }
}
