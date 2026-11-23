# V128 — índice das contagens de outbox esgotada

Em 23/11/2026, às 08h30 (Brasília), a Estrutural registrou timeouts SQL em
dois alertas periódicos de outbox. Ambos contam `outbox_evento` por `tipo`
e `esgotado_em IS NOT NULL`. Após a aplicação manual do índice, a operação
observou `Index Only Scan` em vez de `Parallel Seq Scan`: custo estimado
de 80.651 → 380 para envios e 80.652 → 1.664 para repasses de webhook.
Esses valores são do planejador, não medições de latência nem evidência
de que a outbox tenha causado o chat desatualizado.

## Aplicação

O Flyway 11.7.2 do boot normal aplica a V128 depois das migrations
anteriores. O processo one-shot `--synapse.migrations.run-once` (veja o
[runbook da V73](./41-runbook-upgrade-controlado-v73.md)) é exclusivo da
V73 e não executa a V128. Ao tocar uma base anterior à V73, respeitar
primeiro o procedimento da V73.

A V128 usa `CREATE INDEX CONCURRENTLY IF NOT EXISTS` e seu arquivo
`.sql.conf` define `executeInTransaction=false`; não embrulhe esse
script em `BEGIN/COMMIT` e não rode o script à mão para substituir o
registro pelo Flyway. O boot usa o advisory lock de **sessão** do módulo
PostgreSQL do Flyway, que continua serializando as migrations sem manter
a transação de lock aberta durante a construção do índice. Caso seja
necessário usar Flyway CLI com as mesmas migrations, há dois controles:
`FLYWAY_POSTGRESQL_TRANSACTIONAL_LOCK=false` no processo e o
`.sql.conf` junto ao SQL. Referências: [lock PostgreSQL do Flyway](https://documentation.red-gate.com/flyway/reference/configuration/flyway-namespace/flyway-postgresql-namespace/flyway-postgresql-transactional-lock-setting)
e [configuração por script](https://documentation.red-gate.com/fd/script-configuration-277578847.html).
O Flyway precisa de conexão direta ao PostgreSQL ou de um pool que
preserve a sessão; não execute com um proxy em modo transaction pooling.

A migration cria o índice quando ausente e conserva o índice manual
equivalente e válido na Estrutural, sem recriar e sem mudar OID. Um objeto
homônimo inválido ou com outra definição causa falha explícita; não é
apagado, aceito silenciosamente nem substituído por um índice bloqueante.
O deploy não exige variável nova no Dokploy.

Em base grande sem o índice, planejar uma janela fora do expediente. O
build concorrente permite escritas DML e pode esperar transações antigas
ou DDL concorrente; também consome I/O e CPU. Não agendar outra alteração
na outbox junto. Se a duração for incompatível com o rollout, a operação
pode construir previamente, em conexão direta à base confirmada,
fora de transação e com limites definidos para a janela, o mesmo índice:

```sql
CREATE INDEX CONCURRENTLY idx_outbox_esgotados_por_tipo
    ON public.outbox_evento (tipo)
    WHERE esgotado_em IS NOT NULL;
```

O build pela operação não substitui a migração: a réplica nova valida e
registra a V128 depois. Não remover réplicas saudáveis antes de confirmar
o readiness da nova.

## Verificação e recuperação

Antes do rollout (e após falha ou interrupção), confirmar a instância e
colher apenas o estado técnico do catálogo e do Flyway:

```sql
SELECT c.relkind, i.indisvalid, i.indisready, i.indislive,
       pg_get_indexdef(i.indexrelid) AS definicao
  FROM pg_class c
  LEFT JOIN pg_index i ON i.indexrelid = c.oid
 WHERE c.oid = to_regclass('public.idx_outbox_esgotados_por_tipo');

SELECT version, success FROM flyway_schema_history WHERE version = '128';

SELECT phase FROM pg_stat_progress_create_index
 WHERE datname = current_database() AND relid = 'public.outbox_evento'::regclass;
```

1. Se houver build/incidente ainda em curso, não iniciar outro Flyway nem
   remover o índice; aguardar ou coordenar com quem opera a sessão.
2. Se o índice válido for equivalente, **manter**. Se estiver ausente, a
   tentativa seguinte o cria. Se houver um índice inválido confirmado e
   nenhuma execução em curso, a operação pode, após revisão do objeto
   exato, executar `DROP INDEX CONCURRENTLY public.idx_outbox_esgotados_por_tipo;`
   em uma sessão sem transação e conferir que o nome ficou livre. Se o
   objeto for válido mas divergente (ou não for um índice), não o remover
   automaticamente: revisar finalidade, dependências e plano com DBA e
   liberar o nome de forma controlada.
3. Somente se a V128 estiver registrada com `success = false`, revisar
   todos os demais checksums e migrations com `info`/`validate` antes de
   executar `repair`, com o **mesmo artefato**, mesmas locations,
   configuração e banco de produção. O `repair` também pode alinhar
   metadados de outras versões: se houver qualquer outra divergência,
   interromper e investigar em vez de reparar o histórico. Não apagar
   linhas manualmente e não usar `repair` para mascarar alterações em
   quaisquer migrations aplicadas.
4. Retomar o rollout em janela segura. Verificar índice válido e V128
   com sucesso; usar `EXPLAIN` dos dois contadores se for necessário
   conferir o plano. Se o histórico já tiver V128 com sucesso, não alterar
   o arquivo versionado para tentar reexecutá-lo.

O teste `OutboxEsgotadosMigrationIT` usa a configuração Flyway do boot
normal e PostgreSQL real. Exercita banco sem índice, índice manual
equivalente (com OID preservado), conflito com definição diferente,
escrita durante a espera do build por uma transação anterior,
cancelamento com resíduo inválido e recuperação. A fixture com 50 mil
eventos e 40 esgotados verifica os planos para os dois tipos após
`VACUUM ANALYZE`; o plano real depende de distribuição, estatísticas
e visibilidade de páginas na instância.
