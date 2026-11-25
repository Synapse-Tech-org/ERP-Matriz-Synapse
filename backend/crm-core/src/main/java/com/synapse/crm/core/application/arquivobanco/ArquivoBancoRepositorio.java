package com.synapse.crm.core.application.arquivobanco;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco;
import com.synapse.crm.core.domain.arquivobanco.ArquivoBanco.Metadados;
import com.synapse.crm.core.domain.arquivobanco.TipoArquivoBanco;

public interface ArquivoBancoRepositorio {
    enum Ordem { recentes, nome, tamanho }

    record Filtro(String pasta, TipoArquivoBanco tipo, String busca, Ordem ordem, int pagina, int tamanho) {}

    List<Metadados> listar(Filtro filtro);

    long contar(Filtro filtro);

    Map<String, Long> contarPorPasta();

    long usadoBytes();

    boolean reservarEscrita();

    void gravar(ArquivoBanco arquivo, UUID autor);

    Optional<ArquivoBanco> ativo(UUID id);

    Optional<Metadados> alterar(UUID id, String nome, String pasta, String descricao);

    Optional<Metadados> mover(UUID id, String pasta);

    boolean excluir(UUID id, Instant expiraEm);

    Optional<Metadados> restaurar(UUID id, Instant agora);

    Optional<ArquivoBanco> expiradoParaRemover(Instant agora);

    void removerExpirado(UUID id);
}
