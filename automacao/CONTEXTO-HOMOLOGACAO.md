# Contexto atual da homologacao

### Conversa: decisao de 25/11/2026

O CRM e a unica entrada de eventos para o TypeScript. Em homologacao o corpo
vem no formato Evolution e o modo planejado e AGENTE_IA. Testar esses dois
aspectos separadamente: a Estrutural usa Meta e a ultima configuracao informada
da Femina usa Z-API (UZAPI e legado a confirmar, nao um alias). O modo nao
depende do provedor. Ver [contrato e escopo da entrada](PLANO-CONVERSA.md).

Atualizado em 11/11/2026 a partir da conversa com o operador e dos prints do
Dokploy/Marcondes. Este arquivo nao contem credenciais.

## Branch compartilhada

- Trabalhar em `codex/frontend-automacao-hml`, no mesmo repositorio do CRM.
- Marcondes tambem trabalha nessa branch. Consultar o remoto antes de editar,
  incorporar alteracoes concorrentes e nunca usar force-push.
- `feat/automacao-local-base` foi a branch anterior. Nao e mais o destino do
  desenvolvimento atual e nao deve ser implantada por engano.
- O merge remoto foi feito em `2a254d3`. A revisao consultada nesta verificacao
  e `3df3ed49ae15f9a945e732fa59f87e68968c3f8c`.
- O Dokploy mostrado usa essa branch compartilhada e Compose Path
  `docker/dokploy-stack.yml`, dentro de homologacao / crm-teste.
- Nao modificar Java/frontend do CRM sem autorizacao. API n8n somente consulta.
- Push, publicacao de imagem e deploy sao acoes diferentes. Nao fazer deploy
  nem presumir autorizacao de autodeploy. O print mostra Autodeploy desligado;
  isso nao e verificacao ao vivo nem permissao permanente.

## Imagens e deploy

O objetivo acordado e desenvolver juntos na mesma branch, preservando o CRM
e a automacao, sem alternar branches no Dokploy. Isso NAO elimina por si so a
selecao da imagem: a Stack usa imagens prontas, nao executa o TypeScript do
checkout diretamente.

- `SYNAPSE_IMAGE_TAG`: versao exata das imagens; no print fornecido e
  `br-7fc006b`. E uma observacao daquele print, nao afirmacao do valor atual.
- `SYNAPSE_IMAGE_NAMESPACE=synapse-tech-org`: namespace informado no print.
- `AUTOMACAO_IMAGE_REPOSITORIO` / `AUTOMACAO_IMAGE_DIGEST`, se preenchidos,
  podem selecionar uma imagem da automacao diferente da tag conjunta do CRM.
  Com digest, esse conteudo prevalece sobre a tag.
- Pipeline geral da branch publica backend, frontend e automacao com `br-<sha>`.
  O job isolado antigo `imagem_automacao_hml` continua limitado a branch antiga;
  ele ser skipped aqui nao significa que a imagem geral da automacao falhou.
- CI 1952, run `43040262465`, revisao `3df3ed4`: backend, frontend, automacao,
  infraestrutura e publicacao das tres imagens concluiram com sucesso.
  Link: https://github.com/Synapse-Tech-org/ERP-Matriz-Synapse/actions/runs/43040262465
- CI verde e imagem publicada nao comprovam qual imagem o container da VPS usa.
  Conferir tag/digest real do container antes de atribuir falha ao codigo atual.
- Preservar `automacao` e `automacao-banco` no Compose: `--prune` remove servicos
  ausentes. O incidente anterior de 404 foi associado a uma Stack sem eles.

## Incidente atual: executor iniciou, mas as rodadas falham

Depois do deploy realizado por Marcondes, o operador informou 94 execucoes.
As rodadas verificadas mostram apenas `RODADA_INTERROMPIDA`. Isso comprova que
o problema de imagem sem executor foi superado para essas execucoes; nao pedir
novamente para ligar flags ou interpretar o caso atual como fila ausente.

Consulta read-only ao `automacao_fila.job` mostrou `HTTP_404` nos cinco jobs
mais recentes com erro, incluindo o job `ef6b68e6-5047-4206-ad46-2e5a6d1d6714`
mostrado no painel. O estado e `failed` ou `retry`. Nao sao 94 envios comprovados.

As rotas GET `/internal/v1/automation-config` e `/internal/v1/regras/follow-up`
existem no backend consultado. A consulta do operador no container confirmou
`AUTOMACAO_CRM_URL=https://crm-teste.187.77.47.30.sslip.io`. O executor estava
chamando a URL publica, cujo Traefik nao publica `/internal/v1`, explicando os
HTTP 404. O teste GET comparativo anterior nao executou por colagem incompleta;
nao registrar uma resposta 200 interna que ainda nao foi observada.

Orientacao de correcao: no Dokploy / homologacao / crm-teste / Environment,
usar `AUTOMACAO_CRM_URL=http://synapse-backend-internal:8080` (sem `/internal/v1`,
pois o adaptador acrescenta esse prefixo). Salvar e realizar deploy autorizado
para que o container receba a env. Nao mudar banco, token, tags ou flags para
resolver este 404. As flags ja estao true: ao restabelecer o acesso, o executor
pode enviar mensagens aos candidatos autorizados.

Apos o ajuste, verificar novas rodadas e seus detalhes. Nao afirmar que os
envios foram comprovados antes da verificacao. Nao abrir a rota interna
publicamente nem inventar regras locais para contornar HTTP 404.

Defeito de diagnostico confirmado no executor: o catch da rodada substituia
qualquer causa por `RODADA_INTERROMPIDA`, enquanto a fila guardava a excecao.
Correcao preparada localmente: persistir fase e codigo seguro (HTTP, contrato ou
SQLSTATE), sem URL, token, stack ou mensagem externa bruta. Nao exige migration.
Os registros antigos nao sao reescritos e nenhum job antigo e executado por isso.

## Depois de cadastrar a primeira regra no CRM

O operador confirmou que nao havia regra de follow-up cadastrada. Depois do
cadastro, a rodada `8b75b033-43cb-4a42-8689-ebacbe36635d` exibiu um
`FALHA_NO_PROCESSAMENTO`, um `ULTIMA_MENSAGEM_NAO_ENVIADA` e um
`ULTIMA_MENSAGEM_NAO_E_DA_EQUIPE`. Os dois ultimos sao motivos de ignorar o
candidato, nao falhas de integracao; `PADRAO_UTILIZADO` tambem e informativo.

A consulta read-only no container retornou
`{ restricao: 'true', numeroDoPrintPermitido: false }`. Portanto, o numero do
print nao pode passar pela validacao de envio. Este bloqueio do teste esta
confirmado nas envs reais, nao apenas no exemplo local. A validacao ocorre antes
da reserva e da chamada ao provedor; a versao antiga pode apresentar somente
`FALHA_NO_PROCESSAMENTO` para essa excecao. Isso nao comprova a causa de erros de
outros atendimentos.

Orientacao: acrescentar o numero completo informado no teste a
`WHATSAPP_NUMEROS_PERMITIDOS`, preservando os numeros existentes, manter
`WHATSAPP_RESTRICAO_NUMEROS_HABILITADA=true`, salvar e realizar o deploy autorizado
da mesma imagem para aplicar a env. Nao exige nova tag, liberar todos os numeros
ou mudar o cadastro de regras. Depois, repetir a verificacao e acompanhar a
proxima rodada; outras condicoes de elegibilidade continuam valendo.

Diagnostico local ampliado para preservar os codigos seguros de validacao de
saida, incluindo `NUMERO_NAO_PERMITIDO`, sem expor telefone, texto ou token.
Isso nao desliga restricoes e nao autoriza reenvio. A imagem implantada ainda
pode exibir o antigo erro generico, pois estas alteracoes nao foram publicadas.

## Aceite do provedor sem exibicao utilizavel do follow-up

Rodada `9800b939-3a63-4981-ab17-da6cd824f357`, horario local informado
11/11/2026 23:39:12: um `ENVIADO_E_REGISTRADO`. O operador nao visualizou o
follow-up no celular; o WhatsApp Web exibiu aviso de mensagem que nao pode ser
carregada. Nao confundir esse resultado com ausencia de chamada ao provedor.

Consulta read-only `chat/findMessages` na Evolution HML localizou, para o numero
de teste, a mensagem `3EB0D3E341AA3603749961`, timestamp
`2026-11-12T02:39:12.000Z`, `fromMe=true`, tipo `viewOnceMessage`, com
`MessageUpdate.status=DELIVERY_ACK`. O formato interno contem `interactiveMessage`,
corpo de 59 caracteres e dois botoes `quick_reply` com os IDs
`ev06_followup_sim` e `ev06_followup_nao`, ambos com rotulos presentes.
Nao foi impresso ou persistido nesta documentacao o texto da mensagem.

Essas evidencias confirmam registro na Evolution e um ACK de entrega reportado
por ela, nao exibicao correta no cliente ou leitura. A associacao com a rodada
usa destinatario de teste e timestamp; para ligacao inequivoca pelo ID, conferir
tambem o `whatsapp_message_id` do comprovante dessa rodada no banco da automacao.

`ENVIADO_E_REGISTRADO` no codigo significa: API retornou `key.id` com
`key.fromMe=true`, comprovante persistido e mensagem registrada no CRM. Nao existe
nesta entrega verificacao de renderizacao, reconciliacao de status Evolution
no painel ou comprovacao de leitura. O painel resume etapas e ainda nao exibe
os IDs dos comprovantes: esta e uma lacuna operacional, nao um log de entrega.

Ha relatos no repositorio oficial da Evolution sobre botoes/listas com falha
na linha 2.3.x, inclusive aceite sem entrega. Sao evidencia de compatibilidade
a investigar, nao prova isolada de que o caso local tenha exatamente a mesma causa:

- https://github.com/evolution-foundation/evolution-api/issues/2404
- https://github.com/evolution-foundation/evolution-api/issues/2390

Nao limpar deduplicacao nem reenviar automaticamente essa mensagem: ja existe
ID de provedor e ACK. Nao trocar silenciosamente botoes por texto, porque os
IDs das respostas Sim/Nao continuam sendo tratados pelo n8n. Alteracao de formato,
versao da Evolution, envio de outro teste ou deploy exige coordenacao/autorizacao.
Nenhuma mensagem foi enviada/repetida nas consultas deste diagnostico.

GET da raiz da Evolution HML confirmou versao `2.3.7`. Foi encontrada correcao
oficial candidata na linha pre-release 2.4, com mudancas de migracao/ativacao.
Plano de validacao, alternativas e cuidados:
[PLANO-CORRECAO-BOTOES-EVOLUTION-HML.md](PLANO-CORRECAO-BOTOES-EVOLUTION-HML.md).

## Estado anterior a correcao da imagem (historico)

Painel voltou a abrir, o container existe e o endpoint autenticado
`/painel/api/status` retornou:

```json
{
  "estado": "PRONTO",
  "automacaoHabilitada": true,
  "followUpHabilitado": true,
  "executorDisponivel": false,
  "resumo": {
    "total": 0,
    "sucesso": 0,
    "falhas": 0,
    "emExecucao": 0
  }
}
```

Interpretacao: banco acessivel/preparado, duas flags ligadas, mas executor nao
disponivel e nenhuma rodada registrada nesse banco. Nao pedir novamente para
ligar a mesma flag como se ainda estivesse false. Atualizacao automatica do
painel apenas atualiza a tela; nao inicia o executor.

## Diagnostico confirmado depois da consulta no container

O operador executou a consulta read-only no container ativo: o arquivo
`/app/dist/src/followup/runtime.js` nao existe e readiness retorna 200/UP.
Isso corresponde a uma imagem anterior a implementacao do executor, nao a
uma comprovacao de que o worker atual esteja pronto.

Envs informadas posteriormente pelo operador:

- `SYNAPSE_IMAGE_TAG=br-3df3ed49`.
- `SYNAPSE_IMAGE_NAMESPACE=synapse-tech-org`.
- `AUTOMACAO_IMAGE_REPOSITORIO=ghcr.io/synapse-tech-org/erp-matriz-synapse-automacao`.
- `AUTOMACAO_IMAGE_DIGEST=@sha256:3164a88d1bda939123fafb6476160d58cba3dc95d5d8aaa8267f17f82d628823`.

Esse digest e o da imagem antiga publicada antes do executor e prevalece sobre
a tag conjunta. Trocar somente `SYNAPSE_IMAGE_TAG` nao atualiza seu conteudo.

Os logs dos TRES jobs de publicacao da run 1952 confirmam a tag exata
`br-3df3ed4` (sete caracteres de SHA), e nao `br-3df3ed49`. Jobs consultados:
backend `130599794224`, frontend `130599794265`, automacao `130599794395`.
Nao montar a tag manualmente a partir de um SHA com comprimento diferente:
copiar exatamente o nome publicado no CI.

Orientacao ao operador: para seguir a versao conjunta acordada com Marcondes,
usar a tag publicada nas tres imagens e remover/deixar vazio
`AUTOMACAO_IMAGE_DIGEST`. Manter o repositorio informado. A cada futura versao,
selecionar uma tag conjunta que tenha as tres imagens publicadas; nao manter
um digest antigo prendendo apenas a automacao. O pipeline atual nao altera
automaticamente as envs do Dokploy so porque houve push na branch.

Nenhuma env da VPS foi alterada pelo agente e nenhum deploy foi executado.
Depois da selecao correta da imagem, ainda e necessario conferir readiness,
executor e primeira rodada; nao prometer inicializacao sem essa verificacao.

## Hipoteses anteriores (historico)

Antes da consulta no container e das envs, as evidencias nao distinguiam:

1. Imagem antiga que serve o painel e reconhece flags, mas ainda nao possui o
   executor implementado. Essa versao existiu antes do commit `c7d0153`.
2. Imagem com executor, mas falha na inicializacao da fila/worker ou conexoes.
3. Executor inicializado que posteriormente marcou banco/fila indisponivel.

Foi solicitado ao operador: nome/tag/digest da imagem REAL e logs de inicializacao
do container `automacao` (nao `automacao-banco`), sem senhas ou envs completas.
O log `BANCO_AUTOMACAO_AGUARDANDO_PROVISIONAMENTO` da implementacao atual tambem
pode esconder falha do runtime: o catch cobre preparo do banco e inicio do worker.
Banco PRONTO sozinho nao prova que pg-boss iniciou. Nao recriar o banco, apagar
tabelas ou alterar credenciais sem confirmar a causa.

Nao houve push, deploy, alteracao de envs, ativacao de envios ou escrita n8n
nesta atualizacao de contexto. Teste real de WhatsApp continua exigindo cuidado
com numeros permitidos e com o agendamento antigo para nao executar em duplicidade.

## Incidente de destinatarios na Estrutural - 17/11/2026

Consulta read-only executada pelo operador no container de producao mostrou:
`WHATSAPP_RESTRICAO_NUMEROS_HABILITADA=false`, lista com apenas o numero de
teste e `AUTOMACAO_FOLLOWUP_HABILITADO=true`. Com a restricao desligada, a lista
nao restringe envios. O arquivo de env auditado antes nao comprovava o estado
real do processo. Nao repetir a afirmacao de isolamento baseada apenas no arquivo.

Foram encontrados 13 registros TYPESCRIPT com ID aceito pela Meta desde 16/11:
um correspondente ao numero teste em 17/11 as 01:02 BRT e doze outros leads
entre 08:07 e 08:09 BRT. Telefones foram correlacionados com o cadastro atual;
ID de aceite nao comprova entrega/leitura. A consulta nao cobre envios posteriores
e nao determina quem alterou a env. Nao publicar telefones/IDs de clientes neste doc.

Prints do operador mostram que a flag e GLOBAL e tambem restringe webhooks do
CRM; Marcondes orientou false para nao bloquear clientes reais. A orientacao do
agente de reutilizar essa flag para testar apenas follow-up foi inadequada nesse
ambiente compartilhado. Nao recomendar true global como contencao de producao.

Contencao orientada: desligar AUTOMACAO_FOLLOWUP_HABILITADO e aplicar de forma
autorizada, preservar historico/comprovantes. Ainda falta confirmar contencao real.
Correcao independente de publico do follow-up ficou PENDENTE por decisao do
operador: separar flag/lista da automacao das usadas pelo CRM, com restricao
por padrao. Nenhuma nova env imaginada tem efeito antes de implementar/publicar.
Nao reativar nem reenviar mensagens para investigar o incidente.

O print da rodada fu_93b1fc8d-8c02-4c4e-9e49-073cae4bcfd5 mostrou nove
ENVIADO_E_REGISTRADO e um ENVIADO_REGISTRO_CRM_PENDENTE. Isso identifica falha
de registro CRM apos aceite do provedor, mas NAO informa a causa HTTP original.
Os 177 erros sao contadores de rodadas, nao quantidade de mensagens falhadas.
Consulta agrupada de etapas/motivos/controles pendentes foi solicitada para
identificar outras falhas. Nao afirmar que todas as rodadas falharam pelo mesmo
motivo nem que a falha pendente e necessariamente senha, banco ou erro de Meta.

Painel atual e de consulta: nao implementa edicao de envs/regras, pausa persistente
ou reprocessamento autorizado. Nao simular botoes funcionais nem editar envs
globais em memoria. Melhorias locais de diagnostico nao sao correcao retroativa
de causas descartadas por versoes antigas nem autorizacao de push/deploy.

### Melhorias locais de diagnostico em 17/11

`ProcessarAtendimento` preserva codigo seguro no motivo operacional quando o
registro CRM falha ou o envio fica incerto; HTTP/body/token brutos nao sao salvos.
Recuperacao continua repetindo apenas registro CRM, nunca o envio. Registro
recuperado limpa o motivo operacional antigo. Nao ha migracao nova.

Detalhe do painel passa a listar ate 200 atendimentos da rodada (total visivel),
resultado explicado, ID de comprovante, ID do provedor, ID da mensagem CRM e
motivo sanitizado. Aceite nao e rotulado como entrega/leitura. Tela mostra tambem
o toggle efetivo de follow-up separado do toggle geral. Continua SOMENTE LEITURA.
Nao foram implementados edicao de env, reprocessamento ou publico independente.

Verificacao: testes unitarios e de tipos/build; smoke visual com fixtures locais
em desktop/mobile. O codigo HTTP 400 da fixture NAO e diagnostico de producao.
Consulta real agrupada solicitada ao operador continua pendente; nao afirmar
que as 177 rodadas foram diagnosticadas/corrigidas. Nada foi publicado/implantado.

Em seguida, o diagnostico HTTP local foi aprofundado: resposta de erro lida com
limite de 8 KiB e classificada apenas por titulos/detalhes EXATOS do contrato CRM
(reserva conflitante, wamid em outro atendimento, campo obrigatorio ausente).
Texto externo completo nao e persistido; causa desconhecida preserva apenas HTTP.
Falhas antes do envio agora distinguem fase (validacao, reserva CRM, consulta,
comprovante) em vez de agrupar todos os HTTP como se fossem envio WhatsApp.
Isso nao autoriza repetir POST em producao para reproduzir erro nem recupera
respostas antigas que foram descartadas. Consulta de banco deve aparecer tambem
diretamente na resposta ao operador, nao apenas em pergunta lateral da interface.

### Resultado da consulta real recebida em 17/11

- 2459 etapas com FALHA_NO_PROCESSAMENTO; nao equivalem a clientes unicos.
- Uma etapa ENVIADO_REGISTRO_CRM_PENDENTE no historico.
- Dez ultimas rodadas com erro possuem motivo null.
- REGISTROS_PENDENTES e ERROS_FILA vieram vazios no momento da consulta.
- Fonte publicada 1145d41 confirma catch por atendimento: FalhaIntegracao virava
  FALHA_<codigo>; qualquer outro erro virava FALHA_NO_PROCESSAMENTO sem causa.
  Portanto esses registros nao permitem recuperar retroativamente a excecao.
- Hipotese forte, NAO comprovacao das 2459 ocorrencias: validacao de numero fora
  da lista lancava Error(NUMERO_NAO_PERMITIDO), era registrada como falha, e os
  mesmos atendimentos podiam ser avaliados novamente em varias rodadas.
- Falha de registro que nao consta mais como pendente pode ter sido recuperada;
  verificar comprovante/ID CRM para confirmar, nao prometer causa HTTP recuperada.

Correcao local adicional: recusa pela lista passa a DESTINATARIO_FORA_DA_LISTA_PERMITIDA,
sem reserva nem envio, em vez de transformar uma exclusao esperada em rodada com
erro. Nao altera os numeros permitidos nem corrige o acoplamento global pendente.
Nao reclassificar/apagar o historico antigo para simular que essas causas foram
comprovadas; os demais erros continuam visiveis com fase/codigo nas novas versoes.
