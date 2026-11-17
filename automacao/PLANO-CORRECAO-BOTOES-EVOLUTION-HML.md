# Correcao de botoes na Evolution de homologacao

Plano de 11/11/2026. Nao e autorizacao de deploy, atualizacao de versao ou envio.
Branch compartilhada: `codex/frontend-automacao-hml`.

## Evidencia local

- GET da raiz da Evolution HML confirmou `version=2.3.7`.
- A mensagem de teste das 23:39 possui corpo e dois `quick_reply` corretos,
  dentro de `viewOnceMessage`. Evolution reportou `DELIVERY_ACK`, mas o operador
  nao visualizou o follow-up no celular e o Web exibiu mensagem nao carregavel.
- Ver comprovante e limitacoes em [CONTEXTO-HOMOLOGACAO.md](CONTEXTO-HOMOLOGACAO.md).
- O registro da mensagem no CRM e independente da exibicao no WhatsApp.

## Correcao oficial candidata

As notas de `2.4.0-rc1` descrevem a remocao de `viewOnceMessage` e a inclusao
do node de stanza necessario para exibir botoes em Web/Desktop/iOS/Android.
Isso corresponde ao mecanismo observado, mas ainda precisa de validacao local.
`2.4.0-rc2` e uma estabilizacao dessa linha. Ambas sao PRE-RELEASE; nao tratar
como upgrade estavel garantido nem usar `latest` sem fixar imagem/digest.

Fontes oficiais consultadas:

- https://github.com/evolution-foundation/evolution-api/releases/tag/2.4.0-rc1
- https://github.com/evolution-foundation/evolution-api/releases/tag/2.4.0-rc2
- https://docs.evolutionfoundation.com.br/licensing

Ha impacto adicional: a linha 2.4 exige migracao `RuntimeConfig` e ativacao.
Segundo a documentacao consultada, community continua gratuita, mas a ativacao
pede dados do operador e ha heartbeats de telemetria. Isso precisa ser avaliado
com Marcondes antes de executar a troca; nao prometer ausencia de mudancas.

## Caminho recomendado: preservar botoes

1. Conferir com Marcondes a imagem oficial publicada para a revisao candidata
   e fixar o digest. Nao inventar nome/tag de imagem a partir da release Git.
2. Fazer backup do PostgreSQL e do volume de sessoes da Evolution; registrar
   imagem anterior e forma de restaurar. Reverter so a imagem pode nao reverter
   uma migracao do banco. Preservar a configuracao de webhook e credenciais.
3. Planejar janela na homologacao e parar os disparos enquanto atualiza.
   Nao iniciar dois containers compartilhando a mesma sessao/volume WhatsApp.
4. Aplicar a versao candidata SOMENTE ao servico `evolution.api` de homologacao,
   com migracoes/ativacao previstas pela versao. Nao modificar a tag conjunta
   do CRM ou trocar provedores de producao como parte deste teste.
5. Testar um novo envio autorizado ao numero permitido, mantendo o endpoint
   e os IDs de resposta atuais. Nao limpar comprovantes para reenviar o antigo.
6. Validar texto e botoes visiveis no celular E Web, e a resposta retornando
   pelo CRM/n8n com os IDs corretos. Aceite HTTP/DELIVERY_ACK sozinho nao basta.
7. Validar as respostas Sim e Nao em ciclos de teste controlados. A resposta
   Nao gera recusa persistente: planejar o teste negativo sem apagar bloqueios
   ou liberar outros clientes.
8. Se o teste falhar, interromper disparos e restaurar conforme o backup;
   preservar IDs/comprovantes para evitar duplicacao.

Cada deploy e teste de envio requer autorizacao explicita do operador. Nenhuma
dessas operacoes foi executada na preparacao deste documento.

## Alternativa: texto temporario

So adotar com decisao explicita. Enviar texto e orientar resposta Sim/Nao nao
reproduz automaticamente o contrato de botoes: o n8n atual reconhece seus IDs.
Seria necessario adaptar o consumidor para interpretar texto APENAS quando
ha follow-up pendente do mesmo atendimento/ciclo. Um "nao" solto numa conversa
nao pode virar recusa global. Essa alternativa nao foi implementada.

Nunca enviar texto automaticamente depois de achar que um botao falhou: a
mensagem original pode ter sido aceita/entregue e isso duplicaria o contato.

## Observabilidade da automacao

Melhoria necessaria e independente do upgrade: mostrar comprovante do provedor,
registro CRM e distinguir aceite, ACK de entrega e leitura. Renderizacao no
cliente nao e diretamente comprovada por esses ACKs. Falha/incerteza nao deve
ser escondida por um contador de rodadas concluidas. O painel atual ainda nao
implementa reconciliacao de status Evolution nem exibe todos esses dados.
