package com.synapse.crm.core.infrastructure.arquivobanco;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Duration;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

class RenderizadorDeMiniaturaProtegidoTest {
    private final RenderizadorDeMiniaturaProtegido renderizador = new RenderizadorDeMiniaturaProtegido(
            new MiniaturasArquivoBancoProperties(DataSize.ofMegabytes(8), 320, 16_000_000,
                    100, 14_400, 30_000, 4096, 12_000_000, DataSize.ofMegabytes(2), DataSize.ofMegabytes(32),
                    1, 1, Duration.ofSeconds(3)));

    @AfterEach
    void liberarWorker() {
        renderizador.fechar();
    }

    @Test
    void aceitaJpegEmbutidoCoerenteERecusaDimensoesFalsasAntesDaDecodificacao() throws IOException {
        byte[] coerente = pdfComJpeg(32);
        byte[] divergente = pdfComJpeg(1);

        assertThat(renderizador.renderizar("application/pdf", coerente.length,
                () -> new ByteArrayInputStream(coerente))).isPresent();
        assertThat(renderizador.renderizar("application/pdf", divergente.length,
                () -> new ByteArrayInputStream(divergente))).isEmpty();
    }

    private byte[] pdfComJpeg(int larguraDeclarada) throws IOException {
        try (var pdf = new PDDocument(); var saida = new ByteArrayOutputStream()) {
            var pagina = new PDPage();
            pdf.addPage(pagina);
            var jpeg = JPEGFactory.createFromImage(pdf, new BufferedImage(32, 32, BufferedImage.TYPE_INT_RGB));
            jpeg.setWidth(larguraDeclarada);
            try (var conteudo = new PDPageContentStream(pdf, pagina)) {
                conteudo.drawImage(jpeg, 0, 0, 100, 100);
            }
            pdf.save(saida);
            return saida.toByteArray();
        }
    }
}
