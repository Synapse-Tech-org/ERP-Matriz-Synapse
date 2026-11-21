package com.synapse.crm.core.application.arquivobanco;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.FileImageInputStream;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

import com.synapse.crm.core.domain.arquivobanco.TipoArquivoBanco;

enum FormatoDeArquivoBanco {
    PDF(TipoArquivoBanco.PDF, "application/pdf"),
    DOCX(TipoArquivoBanco.DOCX, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    XLSX(TipoArquivoBanco.XLSX, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    DWG(TipoArquivoBanco.DWG, "image/vnd.dwg"),
    JPEG(TipoArquivoBanco.IMAGEM, "image/jpeg"),
    PNG(TipoArquivoBanco.IMAGEM, "image/png");

    private static final Set<String> CABECALHOS_DWG = Set.of(
            "AC1009", "AC1012", "AC1014", "AC1015", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032");
    private static final int LIMITE_ITENS_OFFICE = 4096;
    private static final int LIMITE_DIRETORIO_OFFICE = 2 * 1024 * 1024;
    private static final long LIMITE_EXPANSAO_OFFICE = 250L * 1024 * 1024;
    private static final int LIMITE_MANIFESTO_OFFICE = 128 * 1024;
    private static final long LIMITE_PIXELS = 25_000_000;
    private static final String NS_TIPOS_OFFICE = "http://schemas.openxmlformats.org/package/2006/content-types";

    private final TipoArquivoBanco tipo;
    private final String mimeType;

    FormatoDeArquivoBanco(TipoArquivoBanco tipo, String mimeType) {
        this.tipo = tipo;
        this.mimeType = mimeType;
    }

    TipoArquivoBanco tipo() { return tipo; }

    String mimeType() { return mimeType; }

    static FormatoDeArquivoBanco verificar(String nome, Path arquivo) {
        FormatoDeArquivoBanco formato = switch (EntradaArquivoBanco.extensao(nome)) {
            case "pdf" -> PDF;
            case "docx" -> DOCX;
            case "xlsx" -> XLSX;
            case "dwg" -> DWG;
            case "jpeg", "jpg" -> JPEG;
            case "png" -> PNG;
            default -> throw invalido();
        };
        try {
            if (!formato.valido(arquivo)) {
                throw invalido();
            }
            return formato;
        } catch (IOException | IllegalArgumentException | XMLStreamException erro) {
            throw invalido();
        }
    }

    private boolean valido(Path arquivo) throws IOException, XMLStreamException {
        return switch (this) {
            case PDF -> prefixo(arquivo, 8).matches("%PDF-[12]\\.[0-9]")
                    && new String(finalDoArquivo(arquivo, 1024), StandardCharsets.US_ASCII).stripTrailing().endsWith("%%EOF");
            case DWG -> Files.size(arquivo) >= 32 && CABECALHOS_DWG.contains(prefixo(arquivo, 6));
            case DOCX -> office(arquivo, "word/document.xml", "wordprocessingml.document.main+xml", "document");
            case XLSX -> office(arquivo, "xl/workbook.xml", "spreadsheetml.sheet.main+xml", "workbook");
            case JPEG, PNG -> imagem(arquivo);
        };
    }

    private boolean imagem(Path arquivo) throws IOException {
        try (FileImageInputStream entrada = new FileImageInputStream(arquivo.toFile())) {
            Iterator<ImageReader> formatos = ImageIO.getImageReaders(entrada);
            if (!formatos.hasNext()) {
                return false;
            }
            ImageReader leitor = formatos.next();
            try {
                if (!leitor.getFormatName().equalsIgnoreCase(name())) {
                    return false;
                }
                leitor.setInput(entrada, true, true);
                return (long) leitor.getWidth(0) * leitor.getHeight(0) <= LIMITE_PIXELS;
            } finally {
                leitor.dispose();
            }
        }
    }

    private static String prefixo(Path arquivo, int tamanho) throws IOException {
        try (InputStream entrada = Files.newInputStream(arquivo)) {
            return new String(entrada.readNBytes(tamanho), StandardCharsets.US_ASCII);
        }
    }

    private static byte[] finalDoArquivo(Path arquivo, int limite) throws IOException {
        try (FileChannel canal = FileChannel.open(arquivo)) {
            var fim = ByteBuffer.allocate((int) Math.min(canal.size(), limite));
            canal.position(canal.size() - fim.capacity());
            while (fim.hasRemaining() && canal.read(fim) != -1) {
                // Ler apenas a cauda, com alocação limitada.
            }
            return fim.array();
        }
    }

    private static boolean office(Path arquivo, String principal, String mimePrincipal, String nomeRaiz)
            throws IOException, XMLStreamException {
        if (!prefixo(arquivo, 4).equals("PK\u0003\u0004") || !diretorioZipLimitado(arquivo)) {
            return false;
        }
        try (ZipFile zip = new ZipFile(arquivo.toFile())) {
            ZipEntry manifesto = zip.getEntry("[Content_Types].xml");
            ZipEntry documento = zip.getEntry(principal);
            if (zip.size() > LIMITE_ITENS_OFFICE || manifesto == null || documento == null
                    || documento.getSize() < 1 || zip.getEntry("_rels/.rels") == null) {
                return false;
            }
            if (!entradasOfficeSeguras(zip)) {
                return false;
            }
            try (InputStream entrada = zip.getInputStream(manifesto);
                    InputStream parte = zip.getInputStream(documento)) {
                return manifestoOffice(entrada.readNBytes(LIMITE_MANIFESTO_OFFICE + 1), principal, mimePrincipal)
                        && raizOffice(parte.readNBytes(16 * 1024), nomeRaiz);
            }
        }
    }

    private static boolean diretorioZipLimitado(Path arquivo) throws IOException {
        byte[] fim = finalDoArquivo(arquivo, 65535 + 22);
        ByteBuffer dados = ByteBuffer.wrap(fim).order(ByteOrder.LITTLE_ENDIAN);
        for (int posicao = fim.length - 22; posicao >= 0; posicao--) {
            if (dados.getInt(posicao) != 0x06054b50
                    || posicao + 22 + Short.toUnsignedInt(dados.getShort(posicao + 20)) != fim.length) {
                continue;
            }
            int itens = Short.toUnsignedInt(dados.getShort(posicao + 10));
            long tamanho = Integer.toUnsignedLong(dados.getInt(posicao + 12));
            long inicio = Integer.toUnsignedLong(dados.getInt(posicao + 16));
            return dados.getShort(posicao + 4) == 0 && dados.getShort(posicao + 6) == 0
                    && itens == Short.toUnsignedInt(dados.getShort(posicao + 8))
                    && itens <= LIMITE_ITENS_OFFICE && tamanho <= LIMITE_DIRETORIO_OFFICE
                    && inicio + tamanho == Files.size(arquivo) - fim.length + posicao;
        }
        return false;
    }

    private static boolean manifestoOffice(byte[] bytes, String principal, String mimePrincipal) throws XMLStreamException {
        if (bytes.length > LIMITE_MANIFESTO_OFFICE) {
            return false;
        }
        XMLStreamReader xml = abrirXml(bytes);
        try {
            if (!avancarAteRaiz(xml) || !"Types".equals(xml.getLocalName()) || !NS_TIPOS_OFFICE.equals(xml.getNamespaceURI())) {
                return false;
            }
            boolean principalDeclarado = false;
            while (xml.hasNext()) {
                if (xml.next() != XMLStreamConstants.START_ELEMENT) {
                    continue;
                }
                String tipo = xml.getAttributeValue(null, "ContentType");
                if (tipo != null) {
                    String normalizado = tipo.toLowerCase(Locale.ROOT);
                    if (normalizado.contains("macroenabled") || normalizado.contains("vbaproject")) {
                        return false;
                    }
                    if ("Override".equals(xml.getLocalName()) && NS_TIPOS_OFFICE.equals(xml.getNamespaceURI())
                            && ("/" + principal).equals(xml.getAttributeValue(null, "PartName"))
                            && ("application/vnd.openxmlformats-officedocument." + mimePrincipal).equals(normalizado)) {
                        principalDeclarado = true;
                    }
                }
            }
            return principalDeclarado;
        } finally {
            xml.close();
        }
    }

    private static boolean raizOffice(byte[] bytes, String nomeRaiz) throws XMLStreamException {
        XMLStreamReader xml = abrirXml(bytes);
        try {
            if (!avancarAteRaiz(xml) || !nomeRaiz.equals(xml.getLocalName())) {
                return false;
            }
            String tipo = nomeRaiz.equals("document") ? "wordprocessingml" : "spreadsheetml";
            String namespace = xml.getNamespaceURI();
            return ("http://schemas.openxmlformats.org/" + tipo + "/2006/main").equals(namespace)
                    || ("http://purl.oclc.org/ooxml/" + tipo + "/main").equals(namespace);
        } finally {
            xml.close();
        }
    }

    private static XMLStreamReader abrirXml(byte[] bytes) throws XMLStreamException {
        XMLInputFactory fabrica = XMLInputFactory.newDefaultFactory();
        fabrica.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        fabrica.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        return fabrica.createXMLStreamReader(new ByteArrayInputStream(bytes));
    }

    private static boolean avancarAteRaiz(XMLStreamReader xml) throws XMLStreamException {
        while (xml.hasNext()) {
            int evento = xml.next();
            if (evento == XMLStreamConstants.START_ELEMENT) {
                return true;
            }
            if (evento == XMLStreamConstants.DTD) {
                return false;
            }
        }
        return false;
    }

    private static boolean entradasOfficeSeguras(ZipFile zip) {
        Set<String> nomes = new HashSet<>();
        long restante = LIMITE_EXPANSAO_OFFICE;
        Iterator<? extends ZipEntry> entradas = zip.entries().asIterator();
        while (entradas.hasNext()) {
            ZipEntry entrada = entradas.next();
            String nome = entrada.getName().toLowerCase(Locale.ROOT);
            long tamanho = entrada.getSize();
            if (nome.startsWith("/") || nome.contains("\\") || nome.contains(":")
                    || nome.equals("..") || nome.startsWith("../") || nome.contains("/../")
                    || nome.endsWith("/..") || !nomes.add(nome) || tamanho < 0 || tamanho > restante
                    || nome.contains("vbaproject") || nome.contains("/activex/") || nome.contains("/embeddings/")) {
                return false;
            }
            restante -= tamanho;
        }
        return true;
    }

    private static FalhaArquivoBanco invalido() {
        return new FalhaArquivoBanco(FalhaArquivoBanco.Motivo.FORMATO_INVALIDO,
                "O formato do conteúdo não corresponde a um tipo de arquivo permitido.");
    }
}
