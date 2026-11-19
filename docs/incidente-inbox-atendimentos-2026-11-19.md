# Lentidão da inbox de Atendimentos — 19/11/2026

## Produção: evidência fornecida

Estrutural, serviços `erp-matriz-hml-oxj4cd_backend` e
`erp-matriz-hml-oxj4cd_frontend`: SHA implantado e base `origin/main` no início
da correção **`16b9f54e7c8fceb822ec59c04237b35cdcd3af55`** (PR #357).
Não havia mudança posterior no fluxo a incorporar naquela revisão.

- As 86 pilhas informadas chegam à seleção paginada do JDBC da inbox.
  Das chamadas lentas **concluídas** em 60 minutos, 1.718 foram
  `ATENDENTE/ATIVOS`, primeira página, limite 51, sem filtro (média 2.768 ms,
  máximo 7.896 ms). São agregados entre usuários, não uma taxa total por sessão.
- Houve 130 ocorrências de cancelamento por statement timeout, 66 de
  `QueryTimeoutException` e uma falha de conexão/transação. Não somar essas
  categorias como requisições distintas. A amostra de 26 sessões ativas, com
  consultas então abaixo de 1 s e sem bloqueadores, não demonstra espera em lock.
- A VPS compartilhada (4 vCPU/~16 GiB) apresentou CPU steal de 23–24% em amostras
  curtas, PostgreSQL entre 9% e 118% de CPU e pico não persistente de outro
  serviço. Isso é concorrência externa observada; não prova causa única da
  latência, nem ciclo repetitivo do frontend, nem encerramento de atendimento.

## Diagnóstico reproduzido e correção

A consulta já paginava IDs antes de montar os cartões. Em `ATIVOS`, porém,
o plano começava por ciclos visíveis (inclusive finalizados) e sondava
`atendimento visivel` pelo mesmo lead a cada ciclo. A estimativa era 1
representante contra 203 reais. O custo estimado também induziu compilação JIT
expressiva. As laterais do cartão já ficavam limitadas às 51 linhas; mover ou
remover não lidas, última mensagem ou identificação do responsável não atacaria
o gargalo dominante.

A seleção paginada de `ATIVOS` passa a unir leads com ciclo aberto do próprio
usuário aos com participação ativa nesse ciclo. A união elimina duplicatas e
permite ao PostgreSQL planejar os dois recortes separadamente. Aplica-se a RLS
do lead antes de escolher o ciclo representante por lead. A escolha ainda
considera todo o histórico **visível desse lead** e pode eleger um ciclo
finalizado com a mensagem mais recente. O dono exibido/filtrado continua sendo
o do ciclo aberto. Os demais recortes, contagens, limite, cursor e RLS
permanecem iguais. Não há índice, migration, alteração de JIT, pool ou timeout.

Os ouvintes globais e da tela compartilham um QueryClient/STOMP por aba.
Mensagens, leituras, fotos, envios que assumem o lead e reconexões reusam o
agendador. Recuperação por foco/rede do navegador continua no TanStack Query;
o primeiro WebSocket CONNECT não invalida a inbox novamente. Uma invalidação
comum não reinicia uma consulta em voo: guarda uma reconciliação por chave.
Rolagem só pede próxima página fora de recarga/erro. A leitura ainda recalcula
os cursores das páginas carregadas; não altera ordem ou presença de cartões
por heurística. Em teste de transporte controlado, com três páginas, sete
disparos durante um GET retido e eco duplicado, o comportamento anterior
iniciou 21 GETs (pico 7 simultâneos); o novo, 6 (pico 1). A amostra não
representa a taxa de produção. Em cancelamentos necessários, o sinal também
evita iniciar páginas adicionais; cancelamento no cliente não prova interrupção
do SQL que já começou.

Qualquer fonte requerida da inbox precisa completar a leitura. Falhas
transitórias de BD/transação retornam HTTP 503 com Problem Details
(`codigo=INBOX_INDISPONIVEL`), sem itens/cursor parcial. Erros de autorização
continuam 401/403. A lista mostra erro recuperável e não substitui dados
válidos por vazio. Em revogação explícita, o cartão é removido mesmo que a
releitura falhe; 401/403 não exibem o snapshot anterior. A aba própria do
Chat Interno não depende dessa composição. Não houve alteração nas regras
para finalizar ou transferir, nem nas rotas de enviar/receber.

## Medição isolada

PostgreSQL 15.18 em Testcontainers/Docker Desktop (8 CPUs lógicas, limite
~7,74 GiB para a VM local, i7-7700K). Fixture: 6.000 leads, 48.000 ciclos,
576.000 mensagens, 48.000 leituras, 40 participações; 160 ativos próprios e
40 ativos alheios com participação, mais seed dev. Após `ANALYZE`, uma conexão
sob `SET LOCAL ROLE synapse_app`, `app.papel=ATENDENTE`,
`app.usuario_id` da Ana e `app.acesso_clientes=true`. O teste verifica que
`row_security_active` está ativo em lead e atendimento. Este caminho JDBC
usa o recorte SQL existente e as políticas do banco, não uma Specification
JPA separada. Os testes HTTP exercitam a autorização real do caso de uso
(incluindo o negativo de carteira alheia). Mesma consulta de
produção montada pelo repositório, sem cursor/filtro, limite 51, 5
aquecimentos + 40 amostras JDBC. Não é um SLA da VPS; as partições da fixture
concentram as mensagens no mês corrente.

| Etapa (amostra local, ms) | SHA implantado | Primeiro protótipo |
|---|---:|---:|
| p50/p95 JDBC da página inteira | 6.120 / 7.930 | 707 / 999 |
| EXPLAIN seleção de IDs | 2.883 | 326 |
| Buffers da seleção (shared hit) | 176.483 | 20.092 |
| EXPLAIN consulta completa | 7.310 | 688 |
| Buffers da consulta completa (shared hit) | 186.310 | 29.762 |
| JIT no plano completo | 5.663 | 524 |

Plano inicial: 47.052 sondagens de `idx_atendimento_lead` no semijoin
de elegibilidade, 1.604 leituras indexadas da data da última mensagem antes
do limite; apenas 51 sondagens da prévia na montagem. A lateral do dono
aberto e a leitura do lead na montagem também só rodam para a página;
as não lidas percorrem os 8 ciclos visíveis por lead da fixture (51 loops
na busca de ciclos e 408 contagens por ciclo). Essas etapas são subplanos da
mesma instrução, não SLAs isolados. `BUFFERS` conta acessos a páginas, não
acessos necessariamente distintos. Os planos completos foram obtidos em
ambiente de teste; os números não foram inferidos a partir dos logs de produção.

Para repetir na branch da correção, use Java 21 e Docker; execute em `backend`:

```sh
./mvnw -pl crm-app -am verify \
  '-Dit.test=PainelFase2EquivalenciaIT#medePrimeiraPaginaAtivaComHistoricoERls,CanalWhatsAppIT#envioERecebimentoFuncionamDuranteCargaDaInbox' \
  -Dfailsafe.failIfNoSpecifiedTests=false -Dsynapse.inbox.benchmark=true
```

O benchmark é opt-in e não usa URL ou banco externos. No Windows, use
`mvnw.cmd` com os mesmos argumentos. Para reproduzir a linha de base, aplique
somente a fixture de medição ao SHA implantado, usando o seletor daquele SHA.
O teste HTTP sob carga usa webhook real do CRM, jobs de entrada/outbox reais
e adaptador de provedor falso, sem envio externo.

## Implantação e rollback (operação do usuário)

1. Validar a CI do SHA aprovado e a publicação das imagens correspondentes.
   Homologar backend e frontend do mesmo SHA, com usuários sintéticos e sem
   carga na VPS durante a janela crítica de Atendimentos.
2. Na janela combinada, selecionar as duas imagens correspondentes pelo fluxo
   normal do Dokploy. **Nenhuma variável nova, configuração ou migration**.
   Registrar antecipadamente as duas referências/digests atuais para rollback.
3. Verificar com usuários autorizados a primeira página, chat e rolagem,
   transferências, reconexão e recuperação de leitura. Comparar
   `[LISTAGEM_PAINEL_LENTA]` por papel/visão e
   `[INBOX_INDISPONIVEL]` com as janelas anteriores; acompanhar espera do pool,
   erros de mensagem, CPU do PostgreSQL e CPU steal separadamente.
4. Se houver regressão de autorização, envio/recebimento ou disponibilidade,
   voltar **as duas imagens** às referências previamente registradas e
   verificar prontidão e inbox de novo. Não alterar dados, baixar proteções
   nem reprocessar mensagens como parte do rollback.

Sem validação produtiva nesta tarefa. O impacto do host compartilhado e o
volume total de requisições por usuário em produção continuam sem atribuição.
