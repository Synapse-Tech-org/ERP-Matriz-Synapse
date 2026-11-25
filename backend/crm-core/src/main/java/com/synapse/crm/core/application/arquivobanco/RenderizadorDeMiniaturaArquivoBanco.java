package com.synapse.crm.core.application.arquivobanco;

import java.io.InputStream;
import java.util.Optional;
import java.util.function.Supplier;

/** Produz apenas PNG rasterizado a partir de um objeto privado já autorizado. */
public interface RenderizadorDeMiniaturaArquivoBanco {
    Optional<byte[]> renderizar(String mimeType, long tamanho, Supplier<InputStream> abrir);
}
