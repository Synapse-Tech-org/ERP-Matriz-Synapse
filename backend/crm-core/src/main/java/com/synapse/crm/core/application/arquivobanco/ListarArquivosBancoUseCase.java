package com.synapse.crm.core.application.arquivobanco;

import java.util.List;
import java.util.Map;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.synapse.crm.core.application.arquivobanco.ArquivoBancoRepositorio.Filtro;
import com.synapse.crm.core.application.arquivobanco.ArquivoBancoRepositorio.Ordem;
import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;
import com.synapse.crm.core.domain.arquivobanco.TipoArquivoBanco;

@Service
public class ListarArquivosBancoUseCase {
    private final ArquivoBancoRepositorio arquivos;
    private final PastaArquivoBancoRepositorio pastas;
    private final BancoArquivosProperties limites;

    public ListarArquivosBancoUseCase(ArquivoBancoRepositorio arquivos, PastaArquivoBancoRepositorio pastas,
            BancoArquivosProperties limites) {
        this.arquivos = arquivos;
        this.pastas = pastas;
        this.limites = limites;
    }

    @PreAuthorize("@capacidades.permite('banco_arquivos.ver')")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Resultado executar(String pasta, TipoArquivoBanco tipo, String busca, Ordem ordem, int pagina, int tamanho) {
        if (pasta != null) {
            EntradaArquivoBanco.pastaExistente(pasta, pastas);
        }
        String termo = busca == null ? "" : busca.strip();
        if (pagina < 0 || tamanho < 1 || tamanho > 100 || termo.length() > 200 || termo.indexOf(0) >= 0) {
            throw EntradaArquivoBanco.invalida("Busca ou paginação inválida.");
        }
        Filtro filtro = new Filtro(pasta, tipo, termo, ordem, pagina, tamanho);
        return new Resultado(arquivos.listar(filtro), arquivos.contar(filtro), arquivos.contarPorPasta(),
                arquivos.usadoBytes(), limites.quota().toBytes(), limites.limiteArquivo().toBytes(), limites.limiteDescricao());
    }

    public record Resultado(List<Metadados> itens, long total, Map<String, Long> contagemPorPasta,
            long usadoBytes, long limiteBytes, long limiteArquivoBytes, int limiteDescricao) {}
}
