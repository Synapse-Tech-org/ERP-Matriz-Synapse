package com.synapse.crm.core.application.arquivobanco;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FormatoDeArquivoBancoTest {
    @TempDir Path temporarios;

    @Test
    void permitePdfComMarcadoresERejeitaSufixoAtivoOuArquivoDisfarcado() throws IOException {
        Path pdf = Files.writeString(temporarios.resolve("pdf"), "%PDF-1.7\nTeste\n%%EOF\n");
        assertThat(FormatoDeArquivoBanco.verificar("amostra.PDF", pdf)).isEqualTo(FormatoDeArquivoBanco.PDF);
        rejeita("amostra.jpg", pdf);
        Files.writeString(pdf, "%PDF-1.7\n%%EOF\n<script></script>");
        rejeita("amostra.pdf", pdf);
    }

    @Test
    void reconheceJpegEPngSemConfiarNaExtensao() throws IOException {
        BufferedImage imagem = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
        Path png = temporarios.resolve("png");
        Path jpg = temporarios.resolve("jpg");
        assertThat(ImageIO.write(imagem, "png", png.toFile())).isTrue();
        assertThat(ImageIO.write(imagem, "jpeg", jpg.toFile())).isTrue();
        assertThat(FormatoDeArquivoBanco.verificar("amostra.png", png)).isEqualTo(FormatoDeArquivoBanco.PNG);
        assertThat(FormatoDeArquivoBanco.verificar("amostra.jpeg", jpg)).isEqualTo(FormatoDeArquivoBanco.JPEG);
        rejeita("amostra.jpg", png);
        rejeita("amostra.svg", png);
    }

    @Test
    void reconheceOoxmlEstruturalERejeitaMacroPacoteIncertoEXmlExterno() throws IOException {
        String tipoWord = "wordprocessingml.document.main+xml";
        String word = "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'/>";
        Path docx = office("word/document.xml", tipoWord, word, Map.of());
        assertThat(FormatoDeArquivoBanco.verificar("amostra.docx", docx)).isEqualTo(FormatoDeArquivoBanco.DOCX);
        rejeita("amostra.xlsx", docx);
        Path xlsx = office("xl/workbook.xml", "spreadsheetml.sheet.main+xml",
                "<workbook xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'/>", Map.of());
        assertThat(FormatoDeArquivoBanco.verificar("amostra.xlsx", xlsx)).isEqualTo(FormatoDeArquivoBanco.XLSX);
        rejeita("amostra.docx", office("word/document.xml", tipoWord, word, Map.of("word/vbaProject.bin", "macro")));
        rejeita("amostra.docx", office("word/document.xml", tipoWord, word, Map.of("../fora.txt", "escape")));
        rejeita("amostra.docx", office("word/document.xml", tipoWord, "<!DOCTYPE doc SYSTEM 'file:///arquivo'>" + word, Map.of()));
        rejeita("amostra.docx", office("word/document.xml", tipoWord, "<html/>", Map.of()));
    }

    @Test
    void validaCabecalhoDwgERecusaNomeComCaminhoOuControle() throws IOException {
        Path dwg = Files.writeString(temporarios.resolve("cad"), "AC1032" + "\u0000".repeat(26));
        assertThat(FormatoDeArquivoBanco.verificar("projeto.dwg", dwg)).isEqualTo(FormatoDeArquivoBanco.DWG);
        Files.writeString(dwg, "AC1032");
        rejeita("projeto.dwg", dwg);
        assertThatThrownBy(() -> EntradaArquivoBanco.nome("../fora.pdf")).isInstanceOf(FalhaArquivoBanco.class);
        assertThatThrownBy(() -> EntradaArquivoBanco.nome("arquivo\r\n.pdf")).isInstanceOf(FalhaArquivoBanco.class);
        assertThatThrownBy(() -> EntradaArquivoBanco.nome("a\u202Egnp.pdf")).isInstanceOf(FalhaArquivoBanco.class);
    }

    private Path office(String parte, String tipo, String conteudo, Map<String, String> extras) throws IOException {
        Path arquivo = Files.createTempFile(temporarios, "pacote-", ".zip");
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(arquivo))) {
            adicionar(zip, "[Content_Types].xml", """
                    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                    <Override PartName="/%s" ContentType="application/vnd.openxmlformats-officedocument.%s"/>
                    </Types>
                    """.formatted(parte, tipo));
            adicionar(zip, "_rels/.rels", "<Relationships/>");
            adicionar(zip, parte, conteudo);
            for (var extra : extras.entrySet()) {
                adicionar(zip, extra.getKey(), extra.getValue());
            }
        }
        return arquivo;
    }

    private static void adicionar(ZipOutputStream zip, String nome, String conteudo) throws IOException {
        zip.putNextEntry(new ZipEntry(nome));
        zip.write(conteudo.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static void rejeita(String nome, Path arquivo) {
        assertThatThrownBy(() -> FormatoDeArquivoBanco.verificar(nome, arquivo))
                .isInstanceOfSatisfying(FalhaArquivoBanco.class,
                        erro -> assertThat(erro.motivo()).isEqualTo(FalhaArquivoBanco.Motivo.FORMATO_INVALIDO));
    }
}
