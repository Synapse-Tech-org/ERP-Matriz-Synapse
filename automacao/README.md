# Automacao TypeScript

Integracao preparada localmente na branch `feat/automacao-local-base`: banco
separado, Fastify e painel TypeScript dentro do MESMO pacote `crm-teste` do
Dokploy, sem alterar Java ou frontend do CRM. A configuracao principal e
`docker/dokploy-stack.yml`. Preparar arquivos nao publica imagem nem faz deploy.

**Follow-up implementado, desligado por padrao.** O executor agendado substitui
somente o follow-up; respostas continuam no n8n. Guia, variaveis, contratos e
limites: [FOLLOWUP-TYPESCRIPT.md](FOLLOWUP-TYPESCRIPT.md).

## Arquivos

| Caminho | Responsabilidade |
| --- | --- |
| `../docker/dokploy-stack.yml` | Opcao principal: integra ao pacote existente |
| `compose.yml` | Alternativa separada; nao implantar junto com a principal |
| `STACK-CRM.md` | Mudancas exatas, ativacao em etapas e retorno seguro |
| `Dockerfile` | Build do servidor/painel; runtime Node nao-root |
| `.env.banco.example` | Variaveis sem segredos reais |
| `banco/provisionar.sh` e `.sql` | Criacao condicional de usuario e banco |
| `banco/clonar-estrutura.sh` | Clone da estrutura do n8n, sem dados |
| `banco/migrations/` | Adaptacoes versionadas da automacao |
| `banco/FAQ-MIGRACAO.md` | V2 da FAQ e credencial do banco da automacao |
| `banco/TABELAS-AUXILIARES.md` | Oito tabelas auxiliares, V2-V9 e aplicacao no deploy |
| `PUBLICACAO-IMAGEM-HML.md` | Publicacao isolada da imagem e checklist do painel |
| `src/operacao/` | Consultas, migracoes, identidade e sessoes |
| `painel/` | Interface propria, sem alterar frontend do CRM |
| `DECISOES-FOLLOWUP-UNIFICADO.md` | Decisoes e limites do follow-up |
| `FOLLOWUP-TYPESCRIPT.md` | Executor, envs, testes e ativacao autorizada |
| `followup.env.example` | Novas envs opcionais SEM segredos reais |
| `src/followup/` | Dominio, casos de uso, contratos e adaptadores |

## Dokploy: procedimento para um deploy futuro autorizado

1. Seguir `STACK-CRM.md`. Manter o servico `crm-teste` existente, branch de teste
   e Compose Path `docker/dokploy-stack.yml`. Nao criar outro item no Dokploy.
2. Obter aprovacao antes de push: Autodeploy pode transforma-lo em deploy.
3. Publicar e conferir a imagem da automacao no GHCR. Esta Stack nao executa
   build; trocar a branch nao seleciona automaticamente a imagem nova.
4. Configurar as envs no MESMO servico, usando `.env.banco.example` como guia.
   Credenciais de PostgreSQL/n8n ja existentes continuam onde estao.
5. Revisar Preview Compose, imagens e backup antes de cada deploy autorizado.

`AUTOMACAO_IMAGE_DIGEST`, opcional, seleciona o conteudo exato da imagem da
automacao, com valor `@sha256:` seguido dos 64 caracteres do digest publicado.
Ausente/vazio usa `SYNAPSE_IMAGE_TAG`, preservando a versao conjunta como padrao.
O nome renderizado pode conter tag e digest; nesse caso o digest seleciona o
conteudo. A antiga variavel `AUTOMACAO_IMAGE_TAG` nao e mais usada: o fallback
aninhado nao funciona corretamente em Docker Stack.
Nao modificar a tag conjunta do CRM para testar uma imagem da automacao.
O CI geral publica imagens em `main`, nas branches `teste/*` e `codex/*` ou em execução
manual com `publicar_imagens=true`. Branches de teste publicam tags `br-<sha curto>`. Na branch `feat/automacao-local-base`, o job isolado
publica SOMENTE a imagem da automacao apos os testes de automacao e infra.
Publicar uma imagem tambem nao executa deploy no Dokploy.

### Inicializacao automatica

1. Com `AUTOMACAO_PROVISIONAR_REPLICAS=1`, a tarefa `automacao-banco` conecta ao
   PostgreSQL existente na rede privada. Default 0: nao executa nada.
2. Cria usuario proprio sem privilegios administrativos e banco proprio se ausentes.
3. Faz `pg_dump --schema-only` do banco interno do n8n e restaura no destino vazio.
4. Grava `automacao_infra.provisionamento` na mesma transacao da restauracao.
5. Com `AUTOMACAO_REPLICAS=1`, servidor/painel iniciam independentemente. Swarm
   nao usa `depends_on`. Enquanto banco nao esta pronto, readiness retorna 503,
   consultas permanecem indisponiveis e o servidor tenta novamente a cada 10s.
6. Quando o banco fica pronto, valida as tabelas e aplica migracoes pendentes,
   com versao/checksum em `automacao_infra.migracao`.

Funciona mesmo com volume PostgreSQL existente: nao depende de executar de novo
o `/docker-entrypoint-initdb.d` do servidor original.
O preparador termina em sucesso ou falha, sem restart automatico. Uma tarefa
concluida pode aparecer com zero containers rodando; conferir exit code e logs.

### Garantias e limites

- Somente estrutura: nao copia registros, credenciais, usuarios ou execucoes.
  A tabela de migrations original tambem fica vazia. Defaults, comentarios e
  corpos de funcoes sao estrutura e podem conter literais; revisar o schema.
- Nao modifica CRM/n8n de origem. Dados de negocio continuam nas tabelas/APIs
  dos fluxos atuais; nao sao recriados aqui.
- Destino diferente de CRM, n8n e bancos de sistema. Sem marcador, qualquer
  tabela/view/sequencia existente bloqueia restauracao.
- Com marcador valido, redeploy preserva estrutura e dados. Nao reclona nem
  acompanha automaticamente mudancas futuras de schema do n8n.
- Advisory lock serializa provisionamentos do mesmo destino. Falha no restore
  desfaz restore e marcador; banco/usuario vazios podem permanecer.
- Usuario existente com privilegios administrativos ou banco com outro dono
  sao recusados. Senha de usuario existente nao e trocada automaticamente.
- O clone nao e um n8n executavel. Nao apontar o runtime n8n para o clone adaptado.
  Historico TS fica nas extensoes `automacao_infra.followup_rodada`/`followup_etapa`;
  o painel combina esse historico com execucoes clonadas, sem simular nodes n8n.
- Cliente PostgreSQL 15, como a referencia da stack. Confirmar versao real:
  cliente antigo nao consegue fazer dump de servidor mais novo.
- Extensoes/objetos que exigem privilegios adicionais fazem o clone falhar.
  Nao ha ampliacao automatica de privilegios; revisar com o responsavel.

### Variaveis no servico existente

`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: banco CRM e credencial
existente. O provisionador usa a capacidade de criar banco/usuario. O executor
habilitado reutiliza a conexao para consultar atendimentos em transacao read-only;
nao grava negocio diretamente. Nao foram restringidas permissoes da credencial.

`N8N_DB_NAME`, `N8N_DB_USER`, `N8N_DB_PASSWORD`: origem com acesso para dump
completo. Somente provisionador. O servidor HTTP nao recebe essas credenciais.

`AUTOMACAO_DB_NAME`, `AUTOMACAO_DB_USER`, `AUTOMACAO_DB_PASSWORD`: destino novo.
Nomes minusculos, numeros e underscore, sem iniciar por numero.
`AUTOMACAO_DB_POOL_MAX`: padrao 3, maximo configuravel 10 POR pool. Painel e
executor possuem pools separados; executor requer no minimo 3. CRM usa outro
pool de 2. Com defaults e follow-up ligado, ate 8 conexoes no processo.

`AUTOMACAO_CRM_URL`: endereco que o servidor da automacao usa para consultar
login e permissoes no CRM. Nao e o endereco do painel. O default
`http://synapse-backend-internal:8080` usa o nome privado do backend no Docker;
funciona na rede privada ja compartilhada pela Stack. `AUTOMACAO_REDE_CRM`
nao e necessario nessa opcao; so e usado pelo Compose separado alternativo.
Tambem pode ser configurado com a URL
publica existente `https://crm-teste.187.77.47.30.sslip.io` (sem `/login`) SOMENTE
para uso do painel. Com follow-up ligado, usar o endereco privado: os contratos
`/internal/v1` nao sao publicados pelo Traefik.

`AUTOMACAO_PAINEL_DOMINIO`: endereco publico NOVO para abrir o painel, sem
`https://` nem caminho. `AUTOMACAO_ROUTER_PREFIX`: identificador unico da rota
no proxy Traefik; ganha sufixo com `TRAEFIK_ROUTER_PREFIX` da instancia para evitar
colisoes entre filhos. Nao e URL nem algo que o usuario precisa acessar.
`AUTOMACAO_MEMORY_LIMIT`: teto de memoria do servico inteiro, inicialmente
768 MiB. Provisionador temporario tem teto de 256 MiB. Este Compose nao impoe
limite de CPU.

`AUTOMACAO_TOKEN`: opcional para API interna de consulta; ausente recusa acesso.
O painel usa sessoes e nao recebe esse token.

O `.env.example` local existente contem valores reais fornecidos pelo operador.
Nao publicar nem copiar para imagens. Usar `.env.banco.example` como referencia
segura e guardar os segredos no Dokploy. Nenhum exemplo e carregado automaticamente.

## Painel independente

URL: `https://<AUTOMACAO_PAINEL_DOMINIO>/painel/`.
Fastify entrega arquivos Vite e API. Nenhuma mudanca no frontend ou Java do CRM.

Com o dominio sugerido em `.env.banco.example`, o endereco sera
`https://painel-automacao-hml.187.77.47.30.sslip.io/painel/`.
Esse endereco so ficara disponivel depois da configuracao e deploy autorizado
da Stack com `AUTOMACAO_REPLICAS=1` e `AUTOMACAO_PAINEL_HABILITADO=true`;
criar arquivos ou preencher somente o dominio nao publica o painel.

Usa APIs EXISTENTES: `POST /api/v1/auth/login`, `GET /api/v1/me` e
`GET /api/v1/gestao/permissoes/minhas`. Exige GESTOR, SUBGESTOR ou ADMINISTRADOR
com `automacao.ver`, `clientes.acessar`, `atendimentos.ver` no alcance `TODOS`.
Evita expor historico global a quem ve somente atendimentos proprios.

Senha nao e persistida; JWT fica somente no servidor. Navegador recebe cookie
HttpOnly/Secure/SameSite=Strict. Sessoes em memoria, maximo 100, expiram junto
ao access token (teto 24h) e revalidam permissoes a cada 30s. Reinicio exige novo
login. Suporta uma replica; sem refresh automatico. Login tem limite de tentativas.
HTTPS e obrigatorio no ambiente publicado. CRM indisponivel nao libera acesso.

Contadores reais, filtros, paginacao e detalhes de etapas. Banco vazio mostra
zero execucoes; banco inacessivel/incompativel mostra falha, sem dados simulados.
Inputs/outputs, headers e erros brutos nao sao expostos. Detalhes limitados a
payload de 1 MiB e 500 etapas. Consultas publicas somente em `/painel/api` com
sessao; `/internal/v1/operacao` exige token e nao e exposto pelo Traefik.

Com o executor desligado nao sao criadas rodadas novas. Depois de ativacao
autorizada, rodadas TS aparecem com resultados e motivos. Sem controles
ficticios de executar/reprocessar. O adaptador
espera `execution_entity` com `id`, `status`, `startedAt`, `stoppedAt`; variantes
incompativeis sao recusadas explicitamente.

## Ativacao

`AUTOMACAO_HABILITADA=false` e `AUTOMACAO_FOLLOWUP_HABILITADO=false` por padrao.
Follow-up exige ambas `true`; ausente/vazio desliga, invalido impede boot.
Com ambas `true`, o executor inicia apos validacao de configuracao, banco e fila.
Painel/saude permanecem acessiveis com processamento desligado. Essas variaveis
nao desligam o n8n existente. Ler o checklist de virada no guia antes de ativar.
`AUTOMACAO_REPLICAS=0`, `AUTOMACAO_PROVISIONAR_REPLICAS=0` e
`AUTOMACAO_PAINEL_HABILITADO=false` sao os defaults da Stack. Novas envs da
automacao nao sao obrigatorias nos filhos desligados.

## Validacao local

Node 22.12+ e npm, dentro de `automacao/`:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:runtime
npm start
```

URL local: `http://127.0.0.1:3100/painel/`. Para autenticar sem HTTPS localmente,
usar `AUTOMACAO_PAINEL_COOKIE_SECURE=false` apenas fora de producao e configurar
`AUTOMACAO_CRM_URL`. `.env` e opcional/ignorado pelo Git. Sem acesso a rede
privada nao ha consulta real ao PostgreSQL da homologacao.

Com Docker disponivel: `bash test/banco-integracao.sh`. Cria/remove apenas um
PostgreSQL efemero local, sem portas publicadas ou credenciais reais. Usa schema
representativo e verifica clone sem dados, repeticao, rollback do restore,
concorrencia, indices/tipos e recusa de destinos protegidos/ocupados. O CI foi
configurado para executar esse teste isolado antes de publicar imagens.

`npm run test:stack` usa o CLI Docker para renderizar a Stack REAL, sem daemon ou
deploy, e verifica imagens e labels resolvidas, defaults e isolamento. Para usar
um cliente fora do PATH, informar `DOCKER_CLI` com seu caminho. Isso nao substitui
o teste de PostgreSQL: nao inicia containers nem conecta a VPS.

Nesta maquina foi usado um cliente Docker temporario, sem daemon ou psql.
Provisionamento precisa passar pelo teste real
e pela validacao de rede, permissoes e versao na homologacao. Testes HTTP/build
nao substituem isso. Nenhum deploy foi feito.
