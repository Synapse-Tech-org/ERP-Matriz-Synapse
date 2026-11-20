# Lentidão da inbox de Atendimentos — 19/11/2026

## Produção: evidência anterior à PR #360

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

## Relato após a PR #360: lentidão e necessidade de F5

O relato de 19/11/2026 foi por volta das 17h (Brasília), com nova queixa às
17h49 (20h49 UTC). Backend e frontend estavam na tag `27b0ca8`, com o layout
V2 ativo (`atendimentos_layout_v2`). Na janela 16h45–17h15 (19h45–20h15 UTC),
a operação informou **6 ocorrências de timeout ao obter conexão do banco** e
**186 listagens lentas concluídas**; `ATIVOS` e `FINALIZADOS` chegaram a cerca
de 4,5 s. A coleta não cobre a segunda queixa. A amostra curta logo após o
deploy, sem timeouts, não descarta saturação posterior. A latência e a
contenção foram observadas; não há evidência sincronizada da sessão do
navegador para atribuir as quedas percebidas ou o efeito de F5 a elas.

### Caminho de falha identificado no backend

O assinante Redis usa o mesmo pool de chat da inbox para identificar quem pode
receber eventos canônicos na fila pessoal e revalidar assinaturas de conversa.
Se a consulta de destinatários falhar, aquela entrega pessoal não acontece.
Se a revalidação de uma assinatura existente falhar por um erro técnico, o
assinante pode suprimir **aquele** evento para não entregar sem autorização,
mantendo a assinatura. O transporte WebSocket pode permanecer conectado e
continuar entregando eventos posteriores. O envio posterior não repõe por si
só o evento omitido. Em particular, o teste existente
`RedisSubscriberDeAtendimentoTest#erro_tecnico_na_revalidacao_nao_entrega_mas_mantem_assinatura_e_nao_revoga`
exercita `onMessage` com timeout sintético do pool e demonstra ausência de
entrega e de revogação, seguida pela entrega de um evento posterior. Não é um
teste de navegador nem prova que esse caminho ocorreu naquele horário.

Uma falha ao autorizar um `SUBSCRIBE` novo, uma sessão de transporte encerrada
e um evento suprimido numa sessão já conectada são fenômenos distintos. Não
usar o total de sessões WebSocket de uma réplica para inferir o estado de uma
aba, nem contagem de timeouts do pool para inferir que houve desconexão.

### Falhas reproduzidas na recuperação do V2

No código da tag implantada, fechar e reabrir o STOMP com HTTP 503 na leitura
de `/estado` deixa os incrementais suspensos. A conexão aparece restabelecida,
mas um novo gatilho é necessário para voltar a receber atualizações. Mesmo
quando o estado já foi restabelecido, uma falha em `/mensagens/desde` interrompe
a recuperação da lacuna do histórico: uma mensagem nova pode aparecer sem
trazer de volta a que chegou durante a desconexão.

A correção repete apenas essas leituras, até duas vezes por erro transitório,
com atraso exponencial e jitter. Conserva a conversa e o rascunho; não reenvia
mutações. A recuperação do histórico usa a mesma âncora até completar, mescla
por identidade e não reaproveita resultados depois de revogação ou troca de
conversa. Se o limite for atingido, a ação de tentar novamente não recarrega
a página. HTTP 403/404 são tratados como perda de acesso, não como lentidão.

O reconciliador também disparava invalidações fora do agendador introduzido
na #360, inclusive em leituras de estado sem alteração de negócio. As
notificações canônicas dos dois ouvintes agora têm a mesma chave de
deduplicação; leituras sem evento não reiniciam lista e contagem. Isso corrige
uma fonte demonstrável de recargas concorrentes, mas não mede a contribuição
delas para a saturação em produção.

O patch não acrescenta polling e não detecta, por si só, um único frame
suprimido se o socket permanecer conectado e não houver outro sinal de
recuperação. O endpoint existente `/mensagens/desde` consulta mensagens pelo
instante de envio; não é replay de todos os eventos (por exemplo, status de
mensagem antiga) e não tem paginação. Não se deve extrapolar a validação de
uma lacuna curta para uma desconexão longa com grande volume.

### Coleta para uma nova ocorrência (somente leitura; equipe de operação)

Na próxima ocorrência, alinhar com **a mesma hora absoluta**, de preferência
com segundos e offset de Brasília ou em UTC:

1. **Navegador afetado, no V2:** anotar início, última atualização observada,
   primeira recuperação, visão (`ATIVOS`, `FINALIZADOS` etc.) e qual ação
   ficou lenta ou desatualizada. Distinguir lista, abertura, histórico, envio
   e chegada de mensagem. Registrar se o problema aconteceu sem troca de aba,
   e se ocorreu recuperação sem F5. Não pedir que a equipe adie a retomada do
   trabalho para completar a captura.
2. **DevTools → Network**, se já estiver disponível, habilitar *Preserve log*.
   Antes/na recuperação, transcrever apenas a hora, início/fim, status HTTP ou
   `cancelada`/`erro de rede`, duração e `codigo` conhecido de Problem Details.
   Priorizar `/api/v1/atendimentos/inbox`, `/api/v1/atendimentos/contagem`,
   `/api/v1/atendimentos/{id}/estado`, `.../{id}/mensagens` e
   `.../{id}/mensagens/desde`. Contar abortos e novos GETs da mesma leitura e
   registrar sobreposição. Para `/ws`, registrar tentativa, HTTP `101` quando
   houver, horário de fechamento (código se disponível) e nova conexão; não
   interpretar `101` como autorização bem-sucedida do STOMP `SUBSCRIBE`. Se o
   console já emitir `[atendimento.abertura]`, transcrever somente `etapa`,
   `visao`, `httpStatus`, `cicloConexao` e tipo `evento` (sem exportar o objeto).
   Para `[atendimento.historico]`, transcrever somente `etapa`, `httpStatus`,
   `cicloConexao` e `tentativas`; não copiar o identificador junto do log.
3. **Servidor:** colher imagens e o recorte sanitizado de todas as réplicas, de
   três a cinco minutos antes do início até três a cinco minutos depois da
   recuperação. Se houver métricas já habilitadas, anexar a série temporal do
   pool (ativas/ociosas/esperando/máximo), duração das listagens/SQL, CPU do
   banco e CPU steal, e marcar reinícios/rollouts no intervalo. Se houver
   logs de acesso do proxy já disponíveis, pedir somente hora, rota normalizada,
   status e duração de `/ws` e das leituras acima. Não ativar logs detalhados,
   executar carga ou reprocessar mensagens para diagnosticar.

Não exportar HAR bruto, URL completa, query string (o handshake de `/ws` pode
transportar credencial), headers, cookies, frames, console bruto, resposta
HTTP, SQL ou conteúdo de mensagens. Usar rótulos sintéticos de aba/conversa
na planilha; se um ID técnico for indispensável para correlação, compartilhá-lo
separadamente por canal privado autorizado. Não registrar dados pessoais.

Exemplo de extração para Docker Swarm, em Bash. Ajustar `inicio` e `fim`; o
intervalo abaixo cobre os relatos de 19/11, inclusive o de 17h49. Somente o
resumo de campos permitidos é gravado. `docker service logs` imprime carimbos
em UTC; o filtro corta no segundo exato, com fim exclusivo. Se o driver ou a
retenção impedir a coleta, registrar essa lacuna — arquivo vazio não confirma
ausência de falha.

```bash
umask 077
set -o pipefail
inicio=2026-11-19T19:44:00Z
fim=2026-11-19T20:55:00Z
backend=erp-matriz-hml-oxj4cd_backend
frontend=erp-matriz-hml-oxj4cd_frontend
saida=$(mktemp ./diagnostico-atendimentos-XXXXXXXX.txt)

printf 'janela_utc=[%s,%s)\n' "$inicio" "$fim" >> "$saida"
for servico in "$backend" "$frontend"; do
  printf 'servico=%s\n' "$servico" >> "$saida"
  docker service inspect "$servico" \
    --format 'imagem={{.Spec.TaskTemplate.ContainerSpec.Image}}' >> "$saida" 2>/dev/null \
    || printf 'imagem=indisponivel\n' >> "$saida"
done

if docker service logs --raw --timestamps --since "$inicio" "$backend" 2>&1 |
  LC_ALL=C awk -v inicio="${inicio%Z}" -v fim="${fim%Z}" '
    function emitir(categoria,   i, f) {
      printf "%s %s", $1, categoria
      for (i = 2; i <= NF; i++) {
        f = $i
        if (f ~ /^(pool=synapse-(chat|geral)|papel=(ATENDENTE|OPERADOR|SUBGESTOR|GESTOR|ADMINISTRADOR)|aba=(ATIVOS|PENDENTES|POTENCIAIS|TODOS|FINALIZADOS)|pagina=(completa|paginada)|cursor=(sim|nao)|filtroAtendente=(sim|nao))$/ ||
            f ~ /^(ativas|ociosas|esperando|total|maximo|saturadoHaSegundos|limiarSegundos|duracaoSegundos|limite|cartoes|duracaoMs|limiteMs|poolAtivas|poolOciosas|poolEsperando|poolMaximo|sessoesAtivas|usuariosAutenticadosUnicos)=[0-9]+$/)
          printf " %s", f
      }
      printf "\n"
    }
    $1 !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9:.]+Z$/ { next }
    substr($1, 1, 19) < inicio || substr($1, 1, 19) >= fim { next }
    /\[METRICA_POOL_CONEXOES\]/       { emitir("POOL"); next }
    /\[ALERTA_POOL_SATURADO\]/        { emitir("POOL_SATURADO"); next }
    /\[POOL_SATURADO_FIM\]/           { emitir("POOL_SATURADO_FIM"); next }
    /\[METRICA_WEBSOCKET_SESSOES\]/   { emitir("SESSOES_WS"); next }
    /\[LISTAGEM_PAINEL_LENTA\]/       { emitir("LISTAGEM_LENTA"); next }
    /\[INBOX_INDISPONIVEL\]/          { print $1, "INBOX_503"; next }
    /Revalidacao de assinatura indisponivel; evento nao entregue, assinatura mantida/ {
      print $1, "EVENTO_NAO_ENTREGUE_ASSINATURA_MANTIDA"; next
    }
    /Falha ao entregar evento canonico na fila pessoal/ { print $1, "FALHA_FILA_PESSOAL"; next }
    /Connection is not available, request timed out/ {
      pool = "indeterminado"
      if (/synapse-chat - Connection/) pool = "synapse-chat"
      if (/synapse-geral - Connection/) pool = "synapse-geral"
      print $1, "TIMEOUT_OBTENCAO_CONEXAO pool=" pool; next
    }
    /canceling statement due to statement timeout/ { print $1, "STATEMENT_TIMEOUT"; next }
  ' >> "$saida"; then
  printf 'coleta_logs=ok\n' >> "$saida"
else
  printf 'coleta_logs=falhou_ou_incompleta\n' >> "$saida"
fi
printf 'Diagnóstico local: %s\n' "$saida"
```

Revisar o arquivo antes de compartilhar. Erros podem aparecer várias vezes
na pilha; não somar linhas como se cada uma fosse uma requisição. Da mesma
forma, um GET cancelado no navegador não prova que a consulta em execução
no PostgreSQL foi interrompida. A comparação necessária é por ordem dos
fatos: erro/espera antes da perda de atualização, fechamento ou não do socket,
resultado do snapshot/histórico, e entrega ou recuperação depois.

## Diagnóstico reproduzido e correção da PR #360

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

| Etapa (amostra local, ms) | SHA implantado | Primeiro protótipo | Correção (UNION) |
|---|---:|---:|---:|
| p50/p95 JDBC da página inteira | 6.120 / 7.930 | 707 / 999 | **56 / 79** |
| EXPLAIN seleção de IDs | 2.883 | 326 | 29 |
| Buffers da seleção (shared hit) | 176.483 | 20.092 | 21.122 |
| EXPLAIN consulta completa | 7.310 | 688 | 40 |
| Buffers da consulta completa (shared hit) | 186.310 | 29.762 | **26.521** |
| JIT no plano completo | 5.663 | 524 | não acionado |

Plano inicial: 47.052 sondagens de `idx_atendimento_lead` no semijoin
de elegibilidade, 1.604 leituras indexadas da data da última mensagem antes
do limite; apenas 51 sondagens da prévia na montagem. A lateral do dono
aberto e a leitura do lead na montagem também só rodam para a página;
as não lidas percorrem os 8 ciclos visíveis por lead da fixture (51 loops
na busca de ciclos e 408 contagens por ciclo). Essas etapas são subplanos da
mesma instrução, não SLAs isolados. `BUFFERS` conta acessos a páginas, não
acessos necessariamente distintos. Os planos completos foram obtidos em
ambiente de teste; os números não foram inferidos a partir dos logs de produção.
No plano final, o ramo próprio usou `idx_atendimento_atendente_status`
com um bitmap scan; o ramo compartilhado percorreu os participantes uma vez
e sondou `atendimento_pkey` 41 vezes (40 da fixture e 1 de teste).
O custo do plano final ficou abaixo do limiar padrão de JIT, sem intervenção
na configuração. A medição final incluiu os possíveis efeitos do histórico
de inserção/remoção da fixture no mesmo container; a latência com cache frio
e com o mesmo CPU steal da VPS não foi medida.

Na execução HTTP final com dois clientes concorrentes, 60 páginas devolveram
200 (p50 110 ms/p95 286 ms). O webhook recebeu e persistiu a mensagem, o caso
de uso de envio gravou a saída e o publisher real a confirmou com o canal
fake, em 1.147 ms para o percurso combinado naquele ensaio. A carga usou o
pool de teste (2 conexões do chat) sem redimensionamento. Não é comparação
HTTP antes/depois nem homologação do provedor real.

Para repetir na branch da correção, use Java 21 e Docker; execute em `backend`:

```sh
./mvnw -pl crm-app -am verify \
  '-Dit.test=PainelFase2EquivalenciaIT#medePrimeiraPaginaAtivaComHistoricoERls' \
  -Dfailsafe.failIfNoSpecifiedTests=false -Dsynapse.inbox.benchmark=true

./mvnw -pl crm-app -am verify \
  '-Dit.test=CanalWhatsAppIT#envioERecebimentoFuncionamDuranteCargaDaInbox' \
  -Dfailsafe.failIfNoSpecifiedTests=false -Dsynapse.inbox.benchmark=true
```

Cada benchmark é opt-in e deve rodar em JVM/container separado da suíte de
regressão; a carga modifica estatísticas e deixa páginas físicas mesmo após
remover a fixture. Não usa URL ou banco externos. No Windows, use
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
