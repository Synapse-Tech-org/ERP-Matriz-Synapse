# Integracao no mesmo pacote do CRM

Estado: implementacao LOCAL na branch `feat/automacao-local-base`, sem push,
publicacao de imagem ou deploy nesta etapa. O teste real de PostgreSQL continua
pendente nesta maquina, que nao tem daemon Docker. O CLI temporario permite
validar a renderizacao da Stack, nao executar containers. Nao confundir configuracao preparada
com implantacao validada.

## O que muda, exatamente

Manter o item `crm-teste` do Dokploy e seu Compose Path `docker/dokploy-stack.yml`.
O painel continua uma aplicacao TypeScript separada do Java, mas passa a ser
iniciado por esse mesmo arquivo de infraestrutura.

- Bloco `automacao` existente: recebe somente credenciais proprias, URL interna
  do CRM e regras de publicacao do painel no Traefik. Sem limite de CPU.
- Bloco NOVO `automacao-banco`: tarefa unica para criar usuario/banco e clonar
  a estrutura do n8n, sem dados. Credenciais administrativas ficam so nessa tarefa.
- Sete configs exclusivos: montam scripts e migracoes de `automacao/banco/` apenas no preparador.
- CI: acrescenta o teste isolado de PostgreSQL e validacao da Stack ativada.
- Validadores: cobrem defaults desligados, isolamento e rota restrita.

Nao mudar os blocos de backend, frontend, PostgreSQL, n8n, Redis, RabbitMQ ou
MinIO. Nao alterar redes/volumes existentes, scripts init do PostgreSQL, credenciais
existentes ou destinos dos webhooks do CRM. Nenhuma migracao nas tabelas do CRM.
O preparador cria um banco a mais no MESMO servidor PostgreSQL, nao outro servidor.

`automacao/compose.yml` permanece apenas como alternativa separada, sem uso
neste procedimento. Nao executar ambos para o mesmo dominio/banco.

## Imagem: por que trocar branch nao e suficiente

A Stack usa imagens prontas do GHCR, nao compila no deploy. A imagem do painel
precisa existir antes de ativar o servico. O pipeline atual publica imagens em
`main` ou por execucao manual com `publicar_imagens=true`. Push na branch de
teste executa validacoes, mas nao publica imagens automaticamente.

Para homologar sem mudar o CRM:

1. Apos aprovacoes, publicar a revisao da branch de teste e aguardar os testes.
2. Confirmar que a execucao manual de publicacao esta disponivel e autorizada.
3. Conferir que a imagem da automacao existe e o Dokploy consegue baixa-la.
4. Usar o digest dessa imagem em `AUTOMACAO_IMAGE_DIGEST`, com prefixo
   `@sha256:` e 64 caracteres hexadecimais. Copiar o digest real da publicacao,
   nao um hash de commit nem um valor inventado.
5. Manter `SYNAPSE_IMAGE_TAG`, `N8N_IMAGE_TAG` e demais selecoes existentes.

Esse override e uma selecao de artefato para homologacao, nao um novo processo
independente de release. Sem override, continua a tag conjunta. O pipeline pode
publicar as tres imagens, mas isso nao manda atualizar backend/frontend.

O fallback aninhado de `AUTOMACAO_IMAGE_TAG` foi retirado apos a falha no deploy
63dee0a. Docker Stack pode deixar `${...}` ou `}` no nome da imagem mesmo quando
`stack config` retorna zero. Nao reintroduzir variaveis aninhadas. O teste
`npm run test:stack` inspeciona a saida real do CLI e cobre esse incidente.
`AUTOMACAO_IMAGE_TAG` nao e mais usada; mante-la nas envs nao seleciona imagem.

O CI usa o namespace de imagens ja existente `ghcr.io/synapse-auto/`.
Confirmar permissoes de publicacao/leitura; nao trocar registries do CRM por conta
propria. Mesmo servico com zero replicas pode ter a imagem resolvida pelo Swarm.

## Preparacao antes de qualquer deploy

- Obter autorizacao especifica para push/deploy. Com Autodeploy ativo, push pode
  ser deploy: alinhar isso antes, nao depois de publicar.
- Registrar envs, versoes/digests e configuracao da homologacao anterior.
- Confirmar backup e possibilidade de restauracao com o responsavel pela VPS.
- Executar o teste `bash automacao/test/banco-integracao.sh` em Docker isolado
  e exigir sucesso antes de ativar o preparador na homologacao.
- Conferir Preview Compose: backend/frontend/n8n/PostgreSQL nao devem receber
  novas versoes ou configuracoes por efeito colateral.
- Usar banco/usuario novos, diferentes do CRM e n8n. Credencial administrativa
  precisa poder criar ambos; a credencial n8n precisa poder fazer schema-only.
- Confirmar dominio e identificador de roteador exclusivos, sem coincidir com
  CRM, n8n, Evolution ou outras rotas do proxy.
- Nao atualizar schema/versao do n8n durante o dump. O dump le a origem e usa
  locks de leitura; pode disputar CPU/IO/conexoes e bloquear alteracoes de schema.
  A espera pela aquisicao de lock no dump e limitada a 10s.

## Etapa A: somente preparar o banco

No MESMO item `crm-teste`, manter as envs existentes e acrescentar banco/usuario/
senha novos de `.env.banco.example`. Para um deploy futuro autorizado:

```dotenv
AUTOMACAO_REPLICAS=0
AUTOMACAO_PROVISIONAR_REPLICAS=1
AUTOMACAO_PAINEL_HABILITADO=false
AUTOMACAO_HABILITADA=false
AUTOMACAO_FOLLOWUP_HABILITADO=false
```

Configurar tambem `AUTOMACAO_IMAGE_DIGEST` com imagem confirmada, conforme acima.
Nao copiar senhas para o Git. `AUTOMACAO_REDE_CRM` nao e necessario nesta Stack.

A tarefa `automacao-banco` aguarda PostgreSQL, cria banco/usuario se ausentes,
restaura somente a estrutura e grava marcador na mesma transacao do restore.
Conclui sem restart automatico. Conferir logs e exit code zero: "Done" do Dokploy
nao comprova o sucesso da tarefa. Falha pode deixar banco/usuario vazios; corrigir
a causa e autorizar nova tentativa, sem apagar bancos existentes.

Sem marcador, destino com objetos e recusado. Com marcador valido, novo deploy
preserva o banco e nao reclona. Depois, o preparador aplica os arquivos V1/V2
pendentes e registra checksum em `automacao_infra.migracao`. Isso tambem funciona
no banco ja clonado de homologacao, sem publicar nova imagem ou ligar o app.
Manter `AUTOMACAO_PROVISIONAR_REPLICAS=1` nos deploys que devem aplicar migracoes.
O log de sucesso e `Migracoes da automacao aplicadas e verificadas`.
Senha de usuario existente nao e redefinida.
Configs Swarm sao imutaveis: futuras alteracoes nos scripts exigem novo nome de
config, por exemplo sufixo v2, e atualizacao das referencias so do preparador.

## Etapa B: liberar somente o painel

Depois de confirmar A e obter autorizacao para outro deploy:

```dotenv
AUTOMACAO_REPLICAS=1
AUTOMACAO_PROVISIONAR_REPLICAS=0
AUTOMACAO_PAINEL_HABILITADO=true
AUTOMACAO_HABILITADA=false
AUTOMACAO_FOLLOWUP_HABILITADO=false
AUTOMACAO_PAINEL_DOMINIO=painel-automacao-hml.187.77.47.30.sslip.io
AUTOMACAO_ROUTER_PREFIX=automacao-hml
AUTOMACAO_CRM_URL=http://synapse-backend-internal:8080
AUTOMACAO_MEMORY_LIMIT=768M
```

URL: `https://painel-automacao-hml.187.77.47.30.sslip.io/painel/`.
Conferir certificado HTTPS, login, permissoes e estado do banco no painel.
Verificar tambem login do CRM e funcionamento do n8n apos o deploy.
O log `BANCO_AUTOMACAO_PRONTO` confirma validacao/migracoes proprias pelo servidor.
Banco vazio deve mostrar zero execucoes. Nao existe executor de follow-up ainda.

Swarm pode iniciar tarefas em qualquer ordem: nao usamos `depends_on`. Caso
ambos sejam ativados juntos, HTTP inicia mas readiness/consultas aguardam o banco
com novas tentativas a cada 10s. O procedimento em duas etapas facilita diagnostico.
O Traefik publica somente raiz e caminhos do painel, nao `/internal/v1` ou saude.

## Outros filhos

Ausentes, as tres envs de replicas/publicacao significam 0/0/false. Os nomes e
senhas novos do banco nao sao obrigatorios para esses filhos. Nada de follow-up
inicia ao integrar codigo na matriz. Compartilhar o arquivo nao compartilha banco.

## Voltar atras

Com autorizacao para alterar envs/reimplantar a homologacao:

```dotenv
AUTOMACAO_REPLICAS=0
AUTOMACAO_PROVISIONAR_REPLICAS=0
AUTOMACAO_PAINEL_HABILITADO=false
AUTOMACAO_HABILITADA=false
AUTOMACAO_FOLLOWUP_HABILITADO=false
```

Isso para nossos componentes e despublica a rota, sem apagar o banco. Nao mexer
em volumes, banco do CRM ou n8n. Rollback de container nao desfaz dados/migracoes;
nao executar restore/drop automaticamente. Preservar o novo banco para diagnostico.

Sem limite de CPU, nao ha teto de uso de processador para nossa aplicacao.
Memoria (768 MiB no servidor e 256 MiB no preparador), pool (3) e timeouts ajudam,
mas nao garantem ausencia de impacto no PostgreSQL/VPS compartilhados.
Nenhum deploy compartilhado tem risco zero; conferir diferencas antes de aplicar.
