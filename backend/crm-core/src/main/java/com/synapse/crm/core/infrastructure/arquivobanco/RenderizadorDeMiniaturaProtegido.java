package com.synapse.crm.core.infrastructure.arquivobanco;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.MemoryCacheImageInputStream;

import jakarta.annotation.PreDestroy;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.io.ScratchFile;
import org.apache.pdfbox.pdfparser.PDFParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.rendering.PageDrawer;
import org.apache.pdfbox.rendering.PageDrawerParameters;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.synapse.crm.core.application.arquivobanco.RenderizadorDeMiniaturaArquivoBanco;

@Component
class RenderizadorDeMiniaturaProtegido implements RenderizadorDeMiniaturaArquivoBanco {
    private static final Logger log = LoggerFactory.getLogger(RenderizadorDeMiniaturaProtegido.class);

    private final MiniaturasArquivoBancoProperties limites;
    private final ThreadPoolExecutor workers;

    RenderizadorDeMiniaturaProtegido(MiniaturasArquivoBancoProperties limites) {
        this.limites = limites;
        this.workers = new ThreadPoolExecutor(limites.trabalhadores(), limites.trabalhadores(), 0, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(limites.fila()), Thread.ofPlatform().daemon().name("miniatura-banco-", 0).factory());
    }

    @Override
    public Optional<byte[]> renderizar(String mimeType, long tamanho, Supplier<InputStream> abrir) {
        String formato = switch (mimeType) {
            case "image/jpeg" -> "JPEG";
            case "image/png" -> "PNG";
            case "image/webp" -> "WebP";
            case "application/pdf" -> "PDF";
            case null, default -> null;
        };
        if (formato == null || tamanho < 1 || tamanho > limites.tamanhoEntrada().toBytes()) return Optional.empty();

        var tarefa = new FutureTask<>(() -> rasterizar(formato, (int) tamanho, abrir));
        try {
            workers.execute(tarefa);
            return Optional.of(tarefa.get(limites.prazo().toMillis(), TimeUnit.MILLISECONDS));
        } catch (InterruptedException erro) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (TimeoutException | ExecutionException | RejectedExecutionException erro) {
            log.debug("Miniatura do Banco de Arquivos indisponível: {}", erro.getClass().getSimpleName());
            return Optional.empty();
        } finally {
            // Cancela a espera e retira tarefas que venceram na fila. Um decoder que não responde à
            // interrupção continua ocupando seu próprio worker, sem admitir mais trabalho no lugar.
            if (tarefa.cancel(true)) workers.remove(tarefa);
        }
    }

    @PreDestroy
    void fechar() {
        workers.shutdownNow();
    }

    private byte[] rasterizar(String formato, int tamanho, Supplier<InputStream> abrir) throws IOException {
        byte[] original = new byte[tamanho];
        try (InputStream entrada = abrir.get()) {
            if (entrada.readNBytes(original, 0, tamanho) != tamanho || entrada.read() != -1) {
                throw new IOException("Tamanho do objeto divergente.");
            }
        }

        BufferedImage raster = formato.equals("PDF") ? primeiraPagina(original) : carregarImagem(original, formato);
        try {
            BufferedImage reduzida = reduzir(raster);
            try (var png = new ByteArrayOutputStream()) {
                if (!ImageIO.write(reduzida, "PNG", png)) throw new IOException("Encoder de PNG indisponível.");
                return png.toByteArray();
            } finally {
                if (reduzida != raster) reduzida.flush();
            }
        } finally {
            raster.flush();
        }
    }

    private BufferedImage carregarImagem(byte[] original, String formato) throws IOException {
        try (var entrada = new MemoryCacheImageInputStream(new ByteArrayInputStream(original))) {
            var leitores = ImageIO.getImageReaders(entrada);
            if (!leitores.hasNext()) throw new IOException("Imagem inválida.");
            ImageReader leitor = leitores.next();
            try {
                if (!formato.equalsIgnoreCase(leitor.getFormatName())) throw new IOException("Imagem divergente.");
                leitor.setInput(entrada, true, true);
                int largura = leitor.getWidth(0);
                int altura = leitor.getHeight(0);
                if (largura < 1 || altura < 1 || (long) largura * altura > limites.pixelsImagem()) {
                    throw new IOException("Imagem acima do orçamento de miniatura.");
                }
                var leitura = leitor.getDefaultReadParam();
                int amostragem = Math.max(1, Math.max(largura, altura) / limites.ladoSaida());
                leitura.setSourceSubsampling(amostragem, amostragem, 0, 0);
                return leitor.read(0, leitura);
            } finally {
                leitor.dispose();
            }
        }
    }

    private BufferedImage primeiraPagina(byte[] original) throws IOException {
        var cache = MemoryUsageSetting.setupMixed(limites.memoriaPdf().toBytes(), limites.armazenamentoTemporarioPdf().toBytes());
        try (var origem = new RandomAccessReadBuffer(original);
                PDDocument pdf = new PDFParser(origem, "", null, null, () -> new ScratchFile(cache)).parse(false)) {
            if (pdf.isEncrypted() || pdf.getNumberOfPages() < 1 || pdf.getNumberOfPages() > limites.paginasPdf()) {
                throw new IOException("PDF indisponível para miniatura.");
            }
            var area = pdf.getPage(0).getCropBox();
            float lado = Math.max(area.getWidth(), area.getHeight());
            if (!Float.isFinite(lado) || !Float.isFinite(area.getWidth()) || !Float.isFinite(area.getHeight())
                    || area.getWidth() < 1 || area.getHeight() < 1 || lado > limites.ladoPdfPontos()) {
                throw new IOException("Página fora do orçamento de miniatura.");
            }

            var renderer = new PDFRenderer(pdf) {
                @Override
                protected PageDrawer createPageDrawer(PageDrawerParameters parametros) throws IOException {
                    return new PaginaComOrcamento(parametros);
                }
            };
            renderer.setSubsamplingAllowed(true);
            renderer.setAnnotationsFilter(anotacao -> false);
            return renderer.renderImage(0, Math.min(1, limites.ladoSaida() / lado), ImageType.RGB);
        }
    }

    private BufferedImage reduzir(BufferedImage imagem) {
        int lado = Math.max(imagem.getWidth(), imagem.getHeight());
        if (lado <= limites.ladoSaida()) return imagem;
        double escala = (double) limites.ladoSaida() / lado;
        int largura = Math.max(1, (int) Math.round(imagem.getWidth() * escala));
        int altura = Math.max(1, (int) Math.round(imagem.getHeight() * escala));
        var reduzida = new BufferedImage(largura, altura, BufferedImage.TYPE_INT_ARGB);
        Graphics2D desenho = reduzida.createGraphics();
        try {
            desenho.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            desenho.drawImage(imagem, 0, 0, largura, altura, null);
        } finally {
            desenho.dispose();
        }
        return reduzida;
    }

    private final class PaginaComOrcamento extends PageDrawer {
        private int operadoresRestantes = limites.operadoresPdf();
        private long pixelsRestantes = limites.pixelsEmbutidosPdf();

        PaginaComOrcamento(PageDrawerParameters parametros) throws IOException {
            super(parametros);
        }

        @Override
        protected void processOperator(Operator operador, List<COSBase> operandos) throws IOException {
            if (Thread.currentThread().isInterrupted() || --operadoresRestantes < 0
                    || operandos.size() > limites.operandosPorOperadorPdf()) {
                throw new OrcamentoExcedido();
            }
            if (operador.getImageParameters() != null && operador.getImageParameters()
                    .getDictionaryObject(COSName.FILTER, COSName.F) != null) {
                // O construtor de PDInlineImage descomprime antes de chamar drawImage, sem scratch limitado.
                throw new OrcamentoExcedido();
            }
            super.processOperator(operador, operandos);
        }

        @Override
        public void drawImage(PDImage imagem) throws IOException {
            debitarPixels(imagem);
            if (imagem instanceof PDImageXObject objeto) {
                debitarPixels(objeto.getMask());
                debitarPixels(objeto.getSoftMask());
            }
            super.drawImage(imagem);
        }

        @Override
        protected void operatorException(Operator operador, List<COSBase> operandos, IOException erro)
                throws IOException {
            // PDFBox normalmente recupera falhas do operador Do; exceder o orçamento interrompe a página.
            if (erro instanceof OrcamentoExcedido) throw erro;
            super.operatorException(operador, operandos, erro);
        }

        private void debitarPixels(PDImage imagem) throws IOException {
            if (imagem == null) return;
            boolean jpeg = validarCodecEVerificarSeJpeg(imagem);
            int largura = imagem.getWidth();
            int altura = imagem.getHeight();
            if (largura < 1 || altura < 1 || (long) largura * altura > pixelsRestantes) {
                throw new OrcamentoExcedido();
            }
            if (jpeg) conferirCabecalhoJpeg(imagem, largura, altura);
            pixelsRestantes -= (long) largura * altura;
        }

        private boolean validarCodecEVerificarSeJpeg(PDImage imagem) throws IOException {
            COSBase filtro = imagem.getCOSObject().getDictionaryObject(COSName.FILTER, COSName.F);
            if (filtro == null) return false;
            // Aceitar um codec só evita cadeias que materializam estágios intermediários de descompressão.
            if (filtro instanceof COSArray filtros && filtros.size() == 1) filtro = filtros.getObject(0);
            if (!(filtro instanceof COSName codec)) throw new OrcamentoExcedido();
            return switch (codec.getName()) {
                case "FlateDecode", "Fl", "CCITTFaxDecode", "CCF", "RunLengthDecode", "RL", "LZWDecode", "LZW",
                        "ASCII85Decode", "A85", "ASCIIHexDecode", "AHx" -> false;
                case "DCTDecode", "DCT" -> true;
                default -> throw new OrcamentoExcedido();
            };
        }

        private void conferirCabecalhoJpeg(PDImage imagem, int largura, int altura) throws IOException {
            if (!(imagem.getCOSObject() instanceof COSStream stream)) throw new OrcamentoExcedido();
            // Filtro DCT sem etapas de descompressão anteriores. O leitor consulta só as dimensões do JPEG.
            try (var bruto = stream.createRawInputStream(); var entrada = new MemoryCacheImageInputStream(bruto)) {
                var leitores = ImageIO.getImageReaders(entrada);
                if (!leitores.hasNext()) throw new OrcamentoExcedido();
                var leitor = leitores.next();
                try {
                    leitor.setInput(entrada, true, true);
                    if (!"JPEG".equalsIgnoreCase(leitor.getFormatName()) || leitor.getWidth(0) != largura
                            || leitor.getHeight(0) != altura) throw new OrcamentoExcedido();
                } finally {
                    leitor.dispose();
                }
            } catch (IOException erro) {
                throw new OrcamentoExcedido(erro);
            }
        }
    }

    private static final class OrcamentoExcedido extends IOException {
        private static final long serialVersionUID = 1L;

        OrcamentoExcedido() {}

        OrcamentoExcedido(IOException causa) {
            super(causa);
        }
    }
}
