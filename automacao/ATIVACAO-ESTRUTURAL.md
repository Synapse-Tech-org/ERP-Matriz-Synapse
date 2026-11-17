# Ativacao controlada do follow-up na Estrutural

## Alerta de incidente - atualizacao de 17/11/2026

NAO APLICAR as fases de envio deste guia na Estrutural em producao. A flag
WHATSAPP_RESTRICAO_NUMEROS_HABILITADA tambem controla o CRM: true pode bloquear
clientes reais; false faz a automacao ignorar a lista. Houve envios fora do
teste. Manter AUTOMACAO_FOLLOWUP_HABILITADO=false na Estrutural ate implementar
e validar publico independente do follow-up. Os exemplos abaixo documentam o
levantamento anterior, nao autorizam ativacao. Ver CONTEXTO-HOMOLOGACAO.md.
Nesta branch nova, testar primeiro na homologacao, sem merge/deploy de producao.

Auditoria de 16/11/2026. Consulta da main no commit
`d7e47da736400125408d5da8402f88d1e6b5276a` e do arquivo local
`Estrutural Vidros/envs atuais`. O arquivo pode nao refletir mudancas posteriores
no Dokploy. Nenhuma credencial e copiada para este guia.

Este documento nao e autorizacao de deploy. Cada deploy precisa de confirmacao.
Nao altera envs, servicos, banco ou fluxos n8n automaticamente.

## Situacao encontrada

- `SYNAPSE_IMAGE_NAMESPACE=synapse-tech-org` e tag salva `1145d41`.
- `AUTOMACAO_HABILITADA=false` e `AUTOMACAO_FOLLOWUP_HABILITADO=false`.
- Credenciais CRM/Postgres/n8n/Meta e `AUTOMACAO_TOKEN` ja possuem valores no arquivo.
  Presenca nao comprova validade, permissoes ou conectividade em producao.
- Faltam `WHATSAPP_PROVEDOR`, configuracao do banco tecnico, replicas da automacao,
  publicacao do painel, repositorio da imagem e restricao de numeros para teste.
- O Compose usa zero replicas por padrao: so ligar os dois toggles nao cria o servico.
- O repositorio da imagem da automacao NAO herda `SYNAPSE_IMAGE_NAMESPACE`.
  Seu default ainda aponta a `synapse-auto`; informar o repositorio explicitamente.

## 1. Preparar banco sem executar follow-up

Adicionar no Environment do projeto Estrutural no Dokploy. Exemplos de nomes;
substituir a senha por um segredo novo, exclusivo deste filho, antes de aplicar:

```dotenv
AUTOMACAO_IMAGE_REPOSITORIO=ghcr.io/synapse-tech-org/erp-matriz-synapse-automacao
AUTOMACAO_DB_NAME=automacao_estrutural
AUTOMACAO_DB_USER=automacao_estrutural_app
AUTOMACAO_DB_PASSWORD=PREENCHER_COM_SEGREDO_NOVO
AUTOMACAO_DB_SCHEMA=public
AUTOMACAO_PROVISIONAR_REPLICAS=1
AUTOMACAO_REPLICAS=0
AUTOMACAO_HABILITADA=false
AUTOMACAO_FOLLOWUP_HABILITADO=false
```

- Banco/usuario devem ser diferentes dos existentes no CRM e n8n.
- O servico `automacao-banco` usa as credenciais existentes para criar o destino
  e clonar SOMENTE a estrutura n8n. Depois aplica V1 a V10 da automacao.
- Nao copia historico, recusas ou configuracoes de atendimento do executor antigo.
- Host/porta sao definidos pelo Compose como `postgres:5432`; nao publicar a porta.
- Aguardar sucesso das migracoes nos logs. Saida 0 da tarefa unica e esperada;
  saida nao zero ou migracao incompleta precisa ser corrigida antes da proxima fase.
- Na proxima fase, colocar `AUTOMACAO_PROVISIONAR_REPLICAS=0` se terminou.
  Para novas migracoes, a tarefa precisara rodar novamente de forma controlada.
- Usar tag cuja imagem da automacao esteja publicada. Nao substituir `1145d41`
  por uma tag calculada apenas a partir do HEAD. Nao preencher digest antigo que
  fixe uma imagem diferente; se houver digest, verificar a imagem completa.

## 2. Subir processo e painel com envios desligados

```dotenv
AUTOMACAO_REPLICAS=1
AUTOMACAO_PROVISIONAR_REPLICAS=0
AUTOMACAO_CRM_URL=http://synapse-backend-internal:8080
AUTOMACAO_PAINEL_HABILITADO=true
AUTOMACAO_PAINEL_DOMINIO=PREENCHER_DOMINIO_EXCLUSIVO_DO_PAINEL
AUTOMACAO_ROUTER_PREFIX=painel-estrutural
AUTOMACAO_HABILITADA=false
AUTOMACAO_FOLLOWUP_HABILITADO=false
```

O dominio deve resolver para a VPS e nao pode ser o dominio ja usado pelo n8n.
Nao colocar `https://` nem caminho na variavel de dominio. O Compose publica a
rota pelo Traefik; acesso em `https://DOMINIO_ESCOLHIDO/painel/` com login CRM.
Reutiliza `TRAEFIK_ROUTER_PREFIX`, `SYNAPSE_TOKEN_INTERNO` e `AUTOMACAO_TOKEN` existentes.
O CRM interno nao usa `/internal/v1` na base: o codigo acrescenta esse caminho.
Memoria e pool ja possuem defaults (`768M` e 3); nao sao envs obrigatorias novas.

O painel funciona sem ligar o follow-up. Validar banco PRONTO e login antes de
habilitar disparos. O toggle geral controla execucao, nao remove painel e historico.

## 3. Restringir destinatarios antes de ligar o executor

```dotenv
WHATSAPP_PROVEDOR=meta-cloud
WHATSAPP_RESTRICAO_NUMEROS_HABILITADA=true
WHATSAPP_NUMEROS_PERMITIDOS=PREENCHER_NUMERO_REAL_DO_LEAD_DE_TESTE
AUTOMACAO_FOLLOWUP_INTERVALO_MINUTOS=2
AUTOMACAO_FOLLOWUP_BOTAO_SIM_ID=ev06_followup_sim
AUTOMACAO_FOLLOWUP_BOTAO_NAO_ID=ev06_followup_nao
AUTOMACAO_FOLLOWUP_TESTE_LOCAL_HABILITADO=false
```

Numero so com digitos, incluindo pais e DDD, igual ao telefone normalizado do
lead no CRM. Multiplos numeros podem ser separados por virgula. Nao usar o
Phone Number ID da conta Meta como destinatario: sao identificadores diferentes.

Essa lista BLOQUEIA envios para outros numeros; NAO redireciona mensagens de
clientes ao numero de teste, nao cria leads e nao ignora as regras do CRM.
Com lista vazia e restricao ligada, nenhum numero pode receber.

`WHATSAPP_NUMERO` e `WHATSAPP_TOKEN` ja estao no arquivo: para Meta, o primeiro
deve ser o Phone Number ID e o segundo deve ter permissoes validas de envio.
`WHATSAPP_URL_BASE` e opcional; default atual `https://graph.facebook.com/v21.0`.
Reutilizar a base/versionamento valido do canal caso o CRM o configure.
Nao adicionar credenciais Z-API/Evolution a este filho Meta.

As regras reais (texto/prazo) devem estar ativas no CRM. Usar atendimento ativo
de teste com ultima mensagem da IA/equipe em status enviado/entregue/lido, sem
resposta posterior e dentro da janela Meta aplicada pelo codigo (maximo 1430 min).
Fora dessa janela nao ha fallback automatico para template.

Regra local opcional: so entra se a lista de regras CRM estiver vazia e exige
`AUTOMACAO_FOLLOWUP_TESTE_LOCAL_HABILITADO=true`,
`AUTOMACAO_FOLLOWUP_TESTE_LEAD_ID` (UUID), `AUTOMACAO_FOLLOWUP_TESTE_TEXTO` e
`AUTOMACAO_FOLLOWUP_TESTE_MINUTOS` (default 10). Nao e filtro universal quando
existem regras CRM e nao substitui a allowlist nem a autorizacao de reserva CRM.

## 4. Compatibilidade com o n8n antes da virada

Nao e apenas adicionar envs. Verificar o consumidor de Sim/Nao e os controles:

- O TypeScript grava/consulta `follow_ups_temporary` e `follow_up_opt_outs` no
  banco da automacao. O n8n que trata respostas precisa compartilhar esse destino
  para que recusas e respostas aparecam ao novo executor.
- Se o n8n ainda aponta para outro banco auxiliar, a migracao vazia nao move esses
  dados. Mapear e preservar recusas e envios anteriores antes de liberar clientes.
  Nao redirecionar todos os nodes Postgres indiscriminadamente nem usar banco
  interno n8n para controles. Nenhuma credencial/node foi alterado nesta auditoria.
- Desligar somente o agendamento do antigo follow-up antes de ligar seu substituto.
  Manter entrada/orquestrador/respostas n8n ativos. Nao executar os dois agendadores
  em paralelo: nao presumir que os controles impedem toda duplicacao entre executores.
- Para impedir encerramento por falta de resposta durante teste, a chave CRM
  `followup.encerrar_pos_followup_minutos=0` desliga essa acao. Nao e env.
  A allowlist limita ENVIO, nao e uma sandbox para todas as acoes sobre atendimentos.
- O default de encerramento e 30 minutos apos envio aceito/registrado. Aceite nao
  prova exibicao no WhatsApp. Testar entrega visivel e respostas reais.

Depois de validar esses pontos e autorizar o deploy de teste:

```dotenv
AUTOMACAO_HABILITADA=true
AUTOMACAO_FOLLOWUP_HABILITADO=true
```

No status do painel devem aparecer flags true, `executorDisponivel=true`, banco
PRONTO e rodadas novas. Rodada concluida nao comprova envio: abrir etapas e
confirmar o resultado, registro CRM e mensagem no WhatsApp do numero permitido.
Nao apagar comprovantes para forcar reenvio. Fazer novo ciclo controlado.

## Estrutura dos adaptadores (alteracao local posterior a main auditada)

- `src/followup/provedores.ts`: fabrica que seleciona e monta o canal.
- `provedores/contratos.ts`: tipos de configuracao e interface de envio.
- `provedores/whatsapp-followup.ts`: validacao/allowlist comum por composicao.
- `provedores/meta.ts`, `z-api.ts`, `evolution.ts`: uma API por classe/arquivo.
- `runtime.ts`: injeta o provedor no processador, que depende de interface.
- Sem novo pacote, env, migracao ou mudanca de payload nesta refatoracao.
- As alteracoes locais nao estao publicadas ate haver push autorizado e imagem
  construida/publicada. Nenhum deploy ou envio e feito pelos testes unitarios.
