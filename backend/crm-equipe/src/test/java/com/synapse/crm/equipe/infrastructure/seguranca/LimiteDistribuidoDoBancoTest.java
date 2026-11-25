package com.synapse.crm.equipe.infrastructure.seguranca;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;

import org.junit.jupiter.api.Test;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.util.unit.DataSize;
import reactor.core.publisher.Flux;

import com.synapse.crm.equipe.infrastructure.seguranca.LimiteDistribuidoDoBanco.Categoria;
import com.synapse.crm.equipe.infrastructure.seguranca.LimitesDeRequisicoesDoBancoProperties.Cota;

class LimiteDistribuidoDoBancoTest {

    @Test
    void timeoutIncluiAberturaBloqueanteDaConexaoRedis() {
        var redis = mock(ReactiveStringRedisTemplate.class);
        var servicoIndisponivel = new CountDownLatch(1);
        when(redis.<Long>execute(any(), anyList(), anyList())).thenReturn(Flux.defer(() -> {
            try {
                servicoIndisponivel.await();
                return Flux.just(0L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return Flux.empty();
            }
        }));
        var cota = new Cota(1, 2);
        var propriedades = new LimitesDeRequisicoesDoBancoProperties(
                Duration.ofMinutes(1), Duration.ofMillis(150), 2, 8,
                DataSize.ofMegabytes(26), DataSize.ofKilobytes(16), 1, 1, 1, 1, cota, cota, cota, cota, cota);
        var limite = new LimiteDistribuidoDoBanco(redis, propriedades);

        try {
            assertTimeoutPreemptively(Duration.ofSeconds(2), () ->
                    assertThatThrownBy(() -> limite.aguardar(UUID.randomUUID(), Categoria.LEITURA))
                            .isInstanceOf(QueryTimeoutException.class));
        } finally {
            servicoIndisponivel.countDown();
            limite.fechar();
        }
    }
}
