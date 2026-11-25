package com.synapse.crm.equipe.infrastructure.seguranca;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeoutException;

import jakarta.annotation.PreDestroy;

import io.github.resilience4j.bulkhead.annotation.Bulkhead;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;

/** Janelas fixas com TTL. Redis verifica e consome as cotas do usuário e da instância atomicamente. */
@Component
class LimiteDistribuidoDoBanco {

    private static final RedisScript<Long> CONSUMIR_COTA = RedisScript.of("""
            local espera = 0
            for i = 1, 2 do
                local quantidade = tonumber(redis.call('GET', KEYS[i]) or '0')
                if quantidade >= tonumber(ARGV[i]) then
                    espera = math.max(espera, redis.call('PTTL', KEYS[i]), 1)
                end
            end
            if espera > 0 then
                return espera
            end
            for i = 1, 2 do
                if redis.call('INCR', KEYS[i]) == 1 then
                    redis.call('PEXPIRE', KEYS[i], ARGV[3])
                end
            end
            return 0
            """, Long.class);

    enum Categoria {
        LEITURA,
        DOWNLOAD,
        MINIATURA,
        UPLOAD,
        ESCRITA
    }

    private final ReactiveStringRedisTemplate redis;
    private final LimitesDeRequisicoesDoBancoProperties propriedades;
    private final Scheduler workers;

    LimiteDistribuidoDoBanco(ReactiveStringRedisTemplate redis, LimitesDeRequisicoesDoBancoProperties propriedades) {
        this.redis = redis;
        this.propriedades = propriedades;
        this.workers = Schedulers.newBoundedElastic(propriedades.threadsRedis(), propriedades.filaRedis(),
                "banco-arquivos-limite");
    }

    @Bulkhead(name = "banco-arquivos-limite")
    @CircuitBreaker(name = "banco-arquivos-limite")
    public Duration aguardar(UUID usuarioId, Categoria categoria) {
        var cota = switch (categoria) {
            case LEITURA -> propriedades.leitura();
            case DOWNLOAD -> propriedades.download();
            case MINIATURA -> propriedades.miniatura();
            case UPLOAD -> propriedades.upload();
            case ESCRITA -> propriedades.escrita();
        };
        // A tag compartilhada coloca as duas chaves do Lua no mesmo slot do Redis Cluster.
        String prefixo = "crm:banco-arquivos:{" + categoria.name().toLowerCase(Locale.ROOT) + "}:limite:";
        return redis.execute(CONSUMIR_COTA, List.of(prefixo + usuarioId, prefixo + "instancia"),
                        List.of(Integer.toString(cota.usuario()), Integer.toString(cota.instancia()),
                                Long.toString(propriedades.janela().toMillis())))
                .singleOrEmpty()
                // A abertura inicial da conexão pode bloquear. Nem ela escapa do timeout do HTTP.
                .subscribeOn(workers)
                .timeout(propriedades.timeoutRedis())
                .onErrorMap(TimeoutException.class, e -> new QueryTimeoutException("Cota do Banco de Arquivos indisponível", e))
                .onErrorMap(RejectedExecutionException.class,
                        e -> new DataAccessResourceFailureException("Cota do Banco de Arquivos ocupada", e))
                .map(Duration::ofMillis)
                .blockOptional()
                .orElseThrow(() -> new DataRetrievalFailureException("Redis não informou a cota do Banco de Arquivos"));
    }

    @PreDestroy
    void fechar() {
        workers.dispose();
    }
}
