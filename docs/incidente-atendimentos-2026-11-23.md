# Atendimentos V2: mensagens e status só aparecem depois de F5 (23/11/2026)

## O que se sabe da Estrutural

Entre 08h e 09h de Brasília (11h–12h UTC), houve dois relatos: histórico não
mostrava a mensagem nova e envio continuava pendente na tela. O frontend
observado era `3fa8465`, com a correção de reconexão da #361. A coleta relatou
54 listagens lentas, seis **linhas** de timeout SQL às 08h30 e um registro
de inbox indisponível. As pilhas observadas apontavam para as contagens dos
alertas de outbox. Não foram encontrados os marcadores consultados de descarte
por revalidação nem de falha na entrega canônica à fila pessoal. Separadamente,
foi aplicado um índice parcial nos alertas. Esses fatos não mostram qual evento
de mensagem ou status chegou ao navegador, nem se um GET atrasado regravou
o histórico; não atribuem a lentidão do chat às contagens.

## Mecanismos reproduzidos e escopo da correção

1. **GET atrasado, socket ainda conectado.** Uma leitura do histórico iniciada
   antes dos frames podia sobrescrever o cache depois de a mensagem nova e o
   status `ENTREGUE` já estarem visíveis. Isso também vale para carregar uma
   página antiga: o TanStack Query capturava o prefixo no começo. A nova
   mesclagem reconhece retornos HTTP, preserva os deltas concorrentes por
   ID/chave e não regride status. O texto e os metadados do snapshot continuam
   vindo da leitura autorizada. Não custa uma segunda requisição.
2. **Status antigo durante revalidação, no mesmo socket.** Entre invalidar e
   confirmar `/estado`, os frames incrementais da conversa eram descartados.
   A #361 relê mensagens pelo horário em que foram enviadas; não alcança o
   status de uma mensagem anterior à âncora. Status recebidos nesse intervalo
   passam a aguardar, em memória e em lote limitado. Só são aplicados após
   confirmar o acesso à mesma conversa no mesmo ciclo. Troca de conversa,
   reconexão ou revogação descarta a espera.
3. **Aviso pessoal de mensagem sem o frame do chat.** O aviso antes só
   atualizava a inbox. Agora é uma pista para a conversa aberta: após 1 s e
   somente se o ID ainda não existir, a tela relê a primeira página autorizada
   e mescla o resultado. Rajadas são agrupadas, a aba oculta não inicia a
   consulta e uma leitura normal em voo tem precedência. O aviso não insere seu
   conteúdo no histórico. A leitura é abortada ao trocar/revogar a seleção e
   não reenvia mensagem.

Não há polling novo, replay completo de WebSocket ou recuperação automática se
**nenhum** sinal chegar. O aviso pessoal de mensagem não cobre status nunca
entregue, mensagem fora da primeira página nesse fallback ou mensagens de
outro ciclo sem sinal para o ciclo selecionado. A investigação de produção
ainda precisa distinguir descarte externo, perda no cliente e latência.

## Evidência local

Os três cenários acima falharam nos testes novos do hook antes da correção.
Após a correção, passaram os 122 testes direcionados de histórico, envio,
reconciliação e página de Atendimentos, incluindo isolamento na troca de
conversa, descarte de resposta tardia após revogação e negativa HTTP 403/404.
O cenário de navegador usa a página real com `atendimentos_layout_v2` ligada,
sessão e conversas sintéticas e transporte controlado. A comparação completa
antes/depois no navegador não foi concluída; os testes de cache/hook não
substituem esse aceite nem uma validação na Estrutural.

## Próxima ocorrência: coleta operacional sem dados de clientes

**Para Michele:** basta enviar o horário aproximado (Brasília) e um sintoma:
“mensagem nova não apareceu” ou “envio ficou pendente”. Não é preciso abrir
DevTools, identificar clientes ou atrasar a retomada do trabalho.

**Para a equipe técnica:** alinhar o relógio da aba afetada com as réplicas,
usar uma janela de 5 minutos antes/depois e seguir o
[roteiro sanitizado da coleta anterior](incidente-inbox-atendimentos-2026-11-19.md#coleta-para-uma-nova-ocorrência-somente-leitura-equipe-de-operação).
Usar, para o relato de 23/11, a janela UTC `[2026-11-23T11:00:00Z, 2026-11-23T12:00:00Z)`.

- No painel **Rede** do navegador, registrar apenas horário de início/fim,
  duração, código HTTP e rota normalizada dos GETs `/estado`, `/mensagens`
  (assinalar se era paginação), `/mensagens/desde`, inbox e do envio se pertinente.
  No WebSocket, registrar 101, conexão/reconexão, e **só o tipo e horário**
  de quadros pertinentes (`MENSAGEM`, `NOVA_MENSAGEM`, `STATUS`,
  `ATENDIMENTO_ESTADO` ou revogação). Se possível, anotar se a mensagem chegou
  a aparecer ou se o status chegou a avançar **antes** de terminar um GET.
  Uma linha de `[atendimento.abertura]` não garante aplicação ao cache.
- Por réplica no servidor, usar nome técnico do job e horário, imagem/digest,
  avisos de saturação do pool, timeouts e marcador de indisponibilidade da
  inbox. No coletor da coleta anterior, antes de classificar o timeout
  genérico, estas regras AWK acrescentam marcadores sem copiar a mensagem do log:

  ```awk
  /PublicadorDaOutbox\.alertarSobreEsgotadas/ { print $1, "PILHA_ALERTA_OUTBOX_ENVIO"; next }
  /PublicadorDeRepasseWebhook\.alertarSobreEsgotados/ { print $1, "PILHA_ALERTA_OUTBOX_REPASSE"; next }
  /Falha ao publicar evento de tempo real no Redis/ { print $1, "FALHA_PUBLICACAO_REDIS"; next }
  /Falha ao verificar acesso a clientes na entrega de evento; entrega omitida/ { print $1, "FALHA_AUTORIZACAO_ENTREGA"; next }
  ```

- Cruzar a ordem: GET iniciou → evento chegou → GET terminou → estado visual.
  Se o frame nunca apareceu numa conexão que ficou aberta, separar isso da
  corrida no cache. Se também não chegou aviso pessoal, este patch não tem um
  sinal para acionar o fallback. Nenhuma dessas situações se infere só pelo
  101, pelo cron às 08h30 ou pela contagem de sessões STOMP.

Não gravar ou compartilhar HAR, URLs/query strings completas, payloads,
frames, headers, tokens, cookies, conteúdo ou identificação pessoal. Se
necessário, use apenas rótulos locais como “aba A / conversa A”. Não habilitar
log verboso, executar carga nem mudar flags em horário de atendimento.
