package com.synapse.crm.core.application.arquivobanco;

import java.util.Optional;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

@Service
public class GerarMiniaturaArquivoBancoUseCase {
    private final ArquivoBancoRepositorio arquivos;
    private final ArmazenamentoArquivoBanco armazenamento;
    private final RenderizadorDeMiniaturaArquivoBanco renderizador;

    GerarMiniaturaArquivoBancoUseCase(
            ArquivoBancoRepositorio arquivos,
            ArmazenamentoArquivoBanco armazenamento,
            RenderizadorDeMiniaturaArquivoBanco renderizador) {
        this.arquivos = arquivos;
        this.armazenamento = armazenamento;
        this.renderizador = renderizador;
    }

    @PreAuthorize("isAuthenticated() and @capacidades.permite('banco_arquivos.ver')")
    public Optional<byte[]> executar(UUID id) {
        var arquivo = arquivos.ativo(id).orElseThrow(FalhaArquivoBanco::naoEncontrado);
        var metadados = arquivo.metadados();
        return renderizador.renderizar(metadados.mimeType(), metadados.tamanhoBytes(),
                () -> armazenamento.abrir(arquivo.referencia()));
    }
}
