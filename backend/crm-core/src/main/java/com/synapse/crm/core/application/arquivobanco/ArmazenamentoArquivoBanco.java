package com.synapse.crm.core.application.arquivobanco;

import java.io.InputStream;
import java.nio.file.Path;

public interface ArmazenamentoArquivoBanco {
    String gravar(Path arquivo, long tamanho, String nome, String mimeType);

    InputStream abrir(String referencia);

    void remover(String referencia);
}
