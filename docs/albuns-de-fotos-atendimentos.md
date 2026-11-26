# Álbuns de fotos em Atendimentos

## Contrato e comportamento

- A grade agrupa 4 ou mais imagens consecutivas do mesmo remetente e atendimento no mesmo dia do separador existente. Texto, outro tipo de mídia, card do chatbot, outro remetente ou atendimento interrompem o bloco. A busca textual mantém as mensagens individuais para não fabricar adjacência.
- O upload existente (`POST /api/v1/atendimentos/{id}/mensagens/midia`) aceita o UUID opcional `loteFotosId`. O backend grava esse campo nos metadados existentes só quando os **bytes** classificam a mídia como imagem. O campo não substitui a chave de idempotência nem é enviado como instrução de álbum ao WhatsApp. Não há migration.
- O composer atribui um lote distinto a cada ação com fotos, inclusive se a seleção tiver menos de quatro. As prévias de uma seleção com quatro ou mais entram juntas no histórico, mas o upload e o despacho existentes continuam por arquivo. Mensagens de saída antigas, sem lote comprovado, não se agrupam por horário. Uma imagem encaminhada individualmente não herda o agrupamento da origem.
- O agrupamento roda sobre o trecho autorizado já carregado, depois de reunir as páginas de histórico e atualizações em tempo real. Se uma página trouxer o restante de um lote, a grade passa a incluir as novas posições. Não há novas leituras de mensagem, assinatura antecipada de URLs ou trabalho no webhook.
- Para fotos **recebidas** sem lote, `ATENDIMENTOS_JANELA_ALBUM_FOTOS_SEGUNDOS` mede a diferença entre a primeira e a última imagem candidata, não a diferença entre vizinhas. Padrão: `5`. Intervalo: `0` a `60`; `0` desliga a heurística, sem desligar os lotes explícitos. Não é possível provar que imagens muito próximas do cliente foram selecionadas juntas quando o provedor não informa o lote.
- A quarta célula mostra `+N` a partir de cinco fotos (`5 → +2`). O visualizador percorre as fotos pela ordem do histórico. Responder, encaminhar, reagir, consultar status e baixar continuam usando a mensagem individual. Mídia não disponível permanece no álbum e não oferece download. As prévias locais só vivem no navegador e não são armazenadas no histórico HTTP.
- Em erro de **upload**, a ação individual reutiliza arquivo, lote e chave de idempotência da foto. Um upload que nunca chegou ao servidor só pode ser reenviado enquanto o navegador tem o arquivo; os aceites persistidos reaparecem após recarregar. Um `FALHOU` **de entrega do provedor**, depois do aceite do upload, não é reprocessado por este controle: o estado também pode significar que o provedor recebeu a foto mas o CRM perdeu a confirmação. Não é seguro criar um novo disparo com base apenas nesse estado. Não houve mudança na política da outbox.

## Provedores auditados

| Provedor | Entrada registrada pelo adaptador | Saída preservada |
| --- | --- | --- |
| Meta Cloud API (configuração documentada da Matriz/Estrutural) | Um `messages[].id` por mensagem e `image.id` por arquivo. O array do webhook não identifica um lote escolhido pelo usuário. | Um objeto `image` por POST, conforme a [referência de imagens da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/image-messages). O `ALBUM` da [API de templates](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-hsm) não é o contrato de envio livre utilizado pelo CRM. |
| Uzapi/Autotic | ID da mensagem e referência individual de mídia, no envelope documentado em [docs/38](38-contrato-uzapi-autotic.md). | Um upload e uma mensagem de imagem por arquivo; nenhum lote nativo é usado pelo adaptador atual. |
| Z-API | Callback com `messageId` e objeto de imagem, conforme [exemplos de recebimento](https://developer.z-api.io/webhooks/on-message-received). | [`send-image`](https://developer.z-api.io/message/send-message-image) recebe uma imagem por chamada. |
| Evolution | Tradutor de `MESSAGES_UPSERT` lê `key.id` e `message.imageMessage`, conforme a [integração Evolution](integracoes/evolution-api/provisionamento.md). | Adaptador existente envia mídia individual. Nenhum campo de lote é interpretado no tradutor atual. |

Nenhum dos fluxos de entrada auditados normaliza um ID de lote confiável; por isso o comportamento de
recebimento é a heurística. Se o provedor vier a documentar essa informação no callback da versão
realmente usada, o adaptador pode normalizá-la sem mudar o histórico ou a grade. Não use ID do webhook,
de arquivo, da mensagem citada ou da conversa como se fosse o ID do lote.

## Homologação depois de publicar

Sem variável obrigatória nova no Dokploy. Só defina a opção da janela se quiser mudar o padrão.
Confirme o provedor da instância sem copiar segredos. Use uma conversa e um telefone de teste:

1. Envie 3, 4 e 5 imagens numeradas pelo composer. Registre o agrupamento **no CRM**, durante o envio e depois de recarregar.
2. Verifique separadamente no celular se todas chegaram em ordem e se o WhatsApp as apresentou juntas ou como mensagens individuais. Não deduza o layout do celular pelo status `ENTREGUE` do CRM.
3. Envie 4 fotos do celular e verifique a promoção da grade no chat aberto. Intercale texto e repita: não deve formar álbum atravessando o texto.
4. Registre versão do app do destinatário, provedor, horário, quantidade enviada/recebida e agrupamento em cada ponta. Use imagens sintéticas nas capturas.
