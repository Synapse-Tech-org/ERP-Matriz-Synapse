package com.synapse.crm.core.application.arquivobanco;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco;
import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;
import com.synapse.crm.sharedkernel.auditoria.Auditable;
import com.synapse.crm.sharedkernel.identidade.UsuarioContext;

@Service
class RegistrarArquivoBanco {
    private static final Logger log = LoggerFactory.getLogger(RegistrarArquivoBanco.class);

    private final ArquivoBancoRepositorio arquivos;
    private final PastaArquivoBancoRepositorio pastas;
    private final ArmazenamentoArquivoBanco armazenamento;
    private final BancoArquivosProperties limites;
    private final UsuarioContext usuario;
    private final Clock relogio;

    RegistrarArquivoBanco(ArquivoBancoRepositorio arquivos, PastaArquivoBancoRepositorio pastas,
            ArmazenamentoArquivoBanco armazenamento,
            BancoArquivosProperties limites, UsuarioContext usuario, Clock relogio) {
        this.arquivos = arquivos;
        this.pastas = pastas;
        this.armazenamento = armazenamento;
        this.limites = limites;
        this.usuario = usuario;
        this.relogio = relogio;
    }

    @Transactional
    @Auditable(acao = "ENVIAR_ARQUIVO_BANCO", entidadeTipo = "ARQUIVO_BANCO", capturarDados = false)
    public Metadados executar(UUID id, String nome, String pasta, String descricao, FormatoDeArquivoBanco formato,
            long tamanho, Path conteudo) {
        if (!pastas.existe(pasta)) {
            throw FalhaArquivoBanco.pastaNaoEncontrada();
        }
        if (!arquivos.reservarEscrita()) {
            throw new FalhaArquivoBanco(FalhaArquivoBanco.Motivo.INDISPONIVEL,
                    "O Banco de Arquivos está recebendo outro envio. Tente novamente.");
        }
        if (tamanho > limites.quota().toBytes() - arquivos.usadoBytes()) {
            throw new FalhaArquivoBanco(FalhaArquivoBanco.Motivo.QUOTA, "A cota do Banco de Arquivos foi atingida.");
        }
        UUID autor = usuario.atual().id();
        Metadados metadados = new Metadados(id, nome, pasta, formato.tipo(), formato.mimeType(),
                tamanho, descricao, Instant.now(relogio));
        String referencia = armazenamento.gravar(conteudo, tamanho, nome, formato.mimeType());
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    try {
                        armazenamento.remover(referencia);
                    } catch (RuntimeException erro) {
                        log.error("Falha ao compensar gravação de arquivo de id {}", metadados.id(), erro);
                    }
                }
            }
        });
        arquivos.gravar(new ArquivoBanco(metadados, referencia), autor);
        return metadados;
    }
}
