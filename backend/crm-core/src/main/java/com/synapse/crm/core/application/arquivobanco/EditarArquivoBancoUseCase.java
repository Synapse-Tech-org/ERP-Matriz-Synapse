package com.synapse.crm.core.application.arquivobanco;

import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;
import com.synapse.crm.sharedkernel.auditoria.Auditable;

@Service
public class EditarArquivoBancoUseCase {
    private final ArquivoBancoRepositorio arquivos;
    private final BancoArquivosProperties limites;

    public EditarArquivoBancoUseCase(ArquivoBancoRepositorio arquivos, BancoArquivosProperties limites) {
        this.arquivos = arquivos;
        this.limites = limites;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.editar')")
    @Transactional
    @Auditable(acao = "EDITAR_ARQUIVO_BANCO", entidadeTipo = "ARQUIVO_BANCO", capturarDados = false)
    public Metadados executar(UUID id, String nome, String pasta, String descricao) {
        String nomeValidado = EntradaArquivoBanco.nome(nome);
        String pastaValidada = EntradaArquivoBanco.pasta(pasta);
        String descricaoValidada = EntradaArquivoBanco.descricao(descricao, limites.limiteDescricao());
        Metadados atual = arquivos.ativo(id).orElseThrow(FalhaArquivoBanco::naoEncontrado).metadados();
        if (!EntradaArquivoBanco.extensao(atual.nome()).equals(EntradaArquivoBanco.extensao(nomeValidado))) {
            throw EntradaArquivoBanco.invalida("A extensão original do arquivo deve ser preservada.");
        }
        return arquivos.alterar(id, nomeValidado, pastaValidada, descricaoValidada)
                .orElseThrow(FalhaArquivoBanco::naoEncontrado);
    }
}
