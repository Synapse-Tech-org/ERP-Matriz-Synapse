# Automacao TypeScript

Servico Node.js/Fastify do mesmo monorepo e release do CRM, isolado por filho.
Esta entrega prepara imagem, inicializacao e Compose. Nao ha follow-up, worker,
fila inicializada, conexao PostgreSQL, painel ou envio de mensagens implementados.
Ter pg-boss instalado nao significa que exista uma fila em execucao.

## Inicializacao sem SSH

O operador nao precisa instalar Node.js ou executar npm na VPS:

1. O CI instala dependencias, executa testes, compila e testa a imagem Docker.
2. A publicacao no GHCR gera imagens de backend, frontend e automacao com a
   mesma tag SHA curta, somente apos todos os jobs necessarios passarem.
3. O Dokploy le `docker/dokploy-stack.yml` e utiliza a `SYNAPSE_IMAGE_TAG`
   escolhida no ambiente da instancia. Mudar a branch nao muda essa tag.
4. Quando autorizado a implantar e com `AUTOMACAO_REPLICAS=1`, o Swarm baixa a
   imagem e executa `node dist/src/server.js`. O processo recebe as envs do Compose,
   valida a configuracao e inicia o HTTP. Nao executa npm, migracoes ou clonagem de banco.
5. O Docker verifica `/health/liveness`. SIGTERM fecha o Fastify e drena requisicoes.

O Dockerfile usa build multi-stage, Node 22 e usuario nao-root. O runtime recebe
apenas dependencias de producao, JavaScript compilado e o healthcheck; nao leva
testes, TypeScript, tsx, `.env` ou segredos.

O servico participa apenas da rede privada `synapse-internal`, pelo endereco
`http://synapse-automacao-internal:3100`. Nao ha porta publicada no host nem
rota no Traefik. O status aparece na saude/logs do container no Dokploy. Uma rota
publica para o futuro painel so deve ser adicionada com autenticacao definida.
Liveness/readiness nesta etapa verificam somente o processo HTTP, nao banco ou
prontidao do follow-up. Nenhuma URL do CRM foi redirecionada para o TypeScript.

## Publicacao e autorizacao

O workflow `.github/workflows/ci.yml` valida a automacao em pushes e PRs.
Publica imagens em push na `main`; nao realiza deploy no Dokploy por conta propria.
Ha tambem `workflow_dispatch`: para publicar uma versao de homologacao de uma
branch, executar o CI nessa branch com `publicar_imagens=true`. Publica as tres
imagens da stack com a mesma tag SHA; fora da `main`, nao atualiza `latest`.
Com a opcao falsa, a execucao manual apenas valida. A disponibilidade desse botao
depende de o workflow estar registrado na branch padrao do GitHub; se a mudanca
ainda nao chegou a ela, concluir a integracao do workflow antes de depender do botao.

PUBLICAR NA BRANCH MONITORADA PODE DISPARAR DEPLOY PELO DOKPLOY. O print de
06/11/2026 mostra `feat/automacao-local-base` com gatilho `On Push`; nao basta
afirmar que push nunca faz deploy. Antes de qualquer push nessa branch, conferir
Autodeploy e obter autorizacao explicita. Desativar esse gatilho tambem exige
combinacao com o operador. Nao executar workflows/publicacao/deploy automaticamente.

Antes de uma futura implantacao autorizada:

- Confirmar a branch e o commit revisados, incluindo as correcoes atuais da `main`.
- Aguardar CI e publicacao das TRES imagens da mesma tag; uma branch selecionada
  no Dokploy sem imagens publicadas nao e suficiente.
- Configurar o Registry privado do GHCR no Dokploy, como nos demais servicos.
- Selecionar a nova `SYNAPSE_IMAGE_TAG`, sabendo que ela tambem atualiza o CRM.
- Conferir Preview Compose e os valores da instancia. Nao aplicar por engano nos filhos.
- Obter autorizacao especifica para esse deploy. Esta documentacao nao a concede.

## Variaveis do Compose por filho

| Variavel | Padrao | Efeito |
| --- | --- | --- |
| `AUTOMACAO_REPLICAS` | `0` | Zero nao inicia processos; `1` permite validar a base HTTP |
| `AUTOMACAO_CPU_LIMIT` | `1.0` | Teto provisorio de CPU para o servico inteiro |
| `AUTOMACAO_MEMORY_LIMIT` | `768M` | Teto provisorio de memoria para o servico inteiro |

Todos possuem defaults no Compose: nao adicionam env obrigatoria aos filhos.
Um servico com zero replicas nao executa a aplicacao, mas o Swarm ainda pode
consultar o registry ao resolver a imagem. Por isso a imagem da tag deve existir
antes de implantar, mesmo quando os fluxos estao desligados.

Para validar SOMENTE a base na homologacao, apos publicacao e autorizacao:

```dotenv
AUTOMACAO_REPLICAS=1
AUTOMACAO_HABILITADA=false
AUTOMACAO_FOLLOWUP_HABILITADO=false
AUTOMACAO_CPU_LIMIT=1.0
AUTOMACAO_MEMORY_LIMIT=768M
```

Nos outros filhos, manter replicas zero e as duas chaves falsas. Os limites sao
um ponto de partida para medir, nao capacidade comprovada da VPS. Ha um unico
orcamento por replica; esta etapa nao cria processos de worker ou cotas separadas.
O desenho final dos dois workers e seu teto combinado de 512 MiB continua para
a implementacao deles; nao confundir com o limite do servico completo.

## Rodar localmente

Requer Node.js 22.12+ e npm. Dentro de `automacao/`:

```sh
npm ci
npm test
npm run typecheck
npm run dev
```

O servidor fica em `http://127.0.0.1:3100/health/liveness`. O arquivo `.env` e
opcional e deve ficar somente na maquina local; use `.env.example` como referencia.
## Chaves de ativacao por filho

| Variavel | Padrao | Efeito |
| --- | --- | --- |
| `AUTOMACAO_HABILITADA` | `false` | Chave geral da automacao TypeScript |
| `AUTOMACAO_FOLLOWUP_HABILITADO` | `false` | Solicita a ativacao do follow-up |

O follow-up so fica habilitado quando as DUAS chaves sao `true`. Ausencia ou
valor vazio significa desligado. Qualquer outro valor diferente de `true` e
`false` impede a inicializacao, mesmo se a outra chave estiver desligada.
`followUpHabilitado` na configuracao e no healthcheck e o estado efetivo,
ja combinado com a chave geral. O HTTP/healthcheck permanece disponivel.

No Dokploy, cada filho conserva seus valores. Nao e necessario adicionar as
variaveis nos filhos existentes para mante-los desligados. Na homologacao,
ativar ambas explicitamente apenas quando o fluxo estiver pronto para testes.
Mudancas nas envs exigem reiniciar/reimplantar o servico. Nao desligam o n8n
nem desfazem efeitos externos que ja aconteceram.

Nesta base, os toggles ainda so controlam o estado exposto: nao existem jobs,
envios ou painel. Ao implementar esses pontos, agendadores, consumidores,
reprocessamento e efeitos externos devem verificar a capacidade efetiva;
o painel de consulta deve continuar acessivel. Nao basta ocultar controles.
O Compose repassa ambas com default `false`, sem exigir novas envs dos filhos.

## Banco: proxima etapa separada

Decisao do usuario em 06/11/2026: investigar diretamente o PostgreSQL e o banco
interno do n8n, depois preparar uma copia SOMENTE DA ESTRUTURA em um banco
separado e vazio para adaptar a automacao. Nao copiar registros, credenciais,
execucoes antigas ou dados de clientes. Nao modificar o banco de origem.

O inventario precisa confirmar schemas, tabelas, tipos, extensoes, funcoes,
indices, relacionamentos e dependencias antes do schema-only. Objetos copiados
nao tornam o runtime do n8n reutilizavel automaticamente. O novo codigo precisara
de repositorios e migracoes proprios; nao apontar um n8n para o clone adaptado.
Consulta, dump e restauracao nao devem ocorrer no startup de cada replica.

Esta entrega nao faz consultas, dump, restauracao, provisionamento, pg-boss.start
ou alteracoes no banco. Nao exige credencial PostgreSQL para o bootstrap HTTP.
O Redis existente pode ser reutilizado quando a implementacao realmente precisar.

O primeiro fluxo-fonte confirmado e `Envio de FollowUps` (`aKmYgITO0HpAyZsX`).
Conversao desse fluxo e painel sao posteriores a esta preparacao de ambiente.

## Validacao do container

Depois de `npm run build`, `npm run test:runtime` tambem exercita o processo
compilado real: boot HTTP, healthcheck, toggle invalido e falha de porta ocupada.
No Linux verifica encerramento por SIGTERM; no Windows o teste encerra o processo
sem afirmar que o handler Linux foi exercitado.

Com Docker disponivel, a partir da raiz do monorepo:

```sh
docker build -f automacao/Dockerfile -t synapse-automacao-ci .
bash docker/verificacao/testar-automacao-container.sh
```

Esse teste cria apenas containers efemeros locais, sem rede externa, com filesystem
somente leitura e sem credenciais. Verifica boot, saude, usuario nao-root,
ausencia de dependencias de desenvolvimento, toggles e encerramento por SIGTERM.
Nao implanta uma stack nem acessa o Dokploy.
