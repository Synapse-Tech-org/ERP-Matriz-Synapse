package com.synapse.crm.core.application.arquivobanco;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;
import com.synapse.crm.core.domain.arquivobanco.PastaArquivoBanco;
import com.synapse.crm.sharedkernel.midia.DetectorDeTipoReal;

@Service
public class EnviarArquivoBancoUseCase {
    private static final Logger log = LoggerFactory.getLogger(EnviarArquivoBancoUseCase.class);

    private final RegistrarArquivoBanco registro;
    private final BancoArquivosProperties limites;
    private final DetectorDeTipoReal detector;

    EnviarArquivoBancoUseCase(RegistrarArquivoBanco registro, BancoArquivosProperties limites, DetectorDeTipoReal detector) {
        this.registro = registro;
        this.limites = limites;
        this.detector = detector;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.criar')")
    public Metadados executar(String nomeOriginal, long tamanho, InputStream conteudo, String pasta, String descricao) {
        if (tamanho <= 0) {
            throw EntradaArquivoBanco.invalida("O arquivo está vazio.");
        }
        if (tamanho > limites.limiteArquivo().toBytes()) {
            throw new FalhaArquivoBanco(FalhaArquivoBanco.Motivo.LIMITE_ARQUIVO, "O arquivo excede o limite permitido.");
        }
        String nome = EntradaArquivoBanco.nome(nomeOriginal);
        String pastaValidada = pasta == null ? PastaArquivoBanco.ID_GERAL : EntradaArquivoBanco.pasta(pasta);
        String descricaoValidada = EntradaArquivoBanco.descricao(descricao, limites.limiteDescricao());
        Path temporario = null;
        try {
            temporario = Files.createTempFile("synapse-banco-", ".upload");
            copiar(conteudo, temporario, tamanho);
            FormatoDeArquivoBanco formato = FormatoDeArquivoBanco.verificar(nome, temporario, detector);
            return registro.executar(UUID.randomUUID(), nome, pastaValidada, descricaoValidada, formato, tamanho, temporario);
        } catch (IOException erro) {
            log.warn("Falha na leitura do upload do Banco de Arquivos", erro);
            throw new FalhaArquivoBanco(FalhaArquivoBanco.Motivo.INDISPONIVEL, "Não foi possível receber o arquivo.", erro);
        } finally {
            apagarTemporario(temporario);
        }
    }

    private static void copiar(InputStream conteudo, Path destino, long tamanho) throws IOException {
        try (var saida = Files.newOutputStream(destino)) {
            byte[] bloco = new byte[8192];
            long restante = tamanho;
            while (restante > 0) {
                int lido = conteudo.read(bloco, 0, (int) Math.min(bloco.length, restante));
                if (lido < 0) {
                    throw EntradaArquivoBanco.invalida("Arquivo recebido incompleto.");
                }
                saida.write(bloco, 0, lido);
                restante -= lido;
            }
            if (conteudo.read() != -1) {
                throw EntradaArquivoBanco.invalida("Tamanho do arquivo divergente.");
            }
        }
    }

    private static void apagarTemporario(Path temporario) {
        if (temporario == null) {
            return;
        }
        try {
            Files.deleteIfExists(temporario);
        } catch (IOException erro) {
            log.warn("Falha ao limpar temporário do Banco de Arquivos", erro);
        }
    }
}
