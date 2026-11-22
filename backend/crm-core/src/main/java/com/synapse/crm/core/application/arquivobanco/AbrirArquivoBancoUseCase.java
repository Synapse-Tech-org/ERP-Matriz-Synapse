package com.synapse.crm.core.application.arquivobanco;

import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco;
import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;

@Service
public class AbrirArquivoBancoUseCase {
    private final ArquivoBancoRepositorio arquivos;
    private final ArmazenamentoArquivoBanco armazenamento;

    public AbrirArquivoBancoUseCase(ArquivoBancoRepositorio arquivos, ArmazenamentoArquivoBanco armazenamento) {
        this.arquivos = arquivos;
        this.armazenamento = armazenamento;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.ver')")
    public ArquivoAberto paraDownload(UUID id) {
        return abrir(ativo(id));
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.ver')")
    public ArquivoAberto paraVisualizacao(UUID id) {
        ArquivoBanco arquivo = ativo(id);
        String mimeType = arquivo.metadados().mimeType();
        if (!FormatoDeArquivoBanco.temPreviaSegura(mimeType)) {
            throw FalhaArquivoBanco.naoEncontrado();
        }
        return abrir(arquivo);
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.enviar')")
    public ArquivoAberto paraEnvio(UUID id) {
        return abrir(ativo(id));
    }

    private ArquivoBanco ativo(UUID id) {
        return arquivos.ativo(id).orElseThrow(FalhaArquivoBanco::naoEncontrado);
    }

    private ArquivoAberto abrir(ArquivoBanco arquivo) {
        Metadados metadados = arquivo.metadados();
        return new ArquivoAberto(metadados.nome(), metadados.mimeType(), metadados.tamanhoBytes(),
                armazenamento.abrir(arquivo.referencia()));
    }

    public record ArquivoAberto(String nome, String mimeType, long tamanhoBytes, InputStream conteudo)
            implements AutoCloseable {
        @Override
        public void close() throws IOException {
            conteudo.close();
        }
    }
}
