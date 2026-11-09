# Automacao TypeScript

Entrega na branch `feat/automacao-local-base`: banco separado, Fastify e
painel independente em TypeScript. Nenhum arquivo Java, frontend do CRM ou
Compose principal foi alterado nesta entrega. Publicar a branch nao comprova
deploy: a nova aplicacao exige o servico separado descrito abaixo.

**Follow-up ainda nao foi implementado.** Nao ha agendamento, envio, consumidor
de fila ou reprocessamento. pg-boss instalado nao significa fila em execucao.

## Arquivos

| Caminho | Responsabilidade |
| --- | --- |
| `compose.yml` | Novo servico Dokploy, separado da stack existente |
| `Dockerfile` | Build do servidor/painel; runtime Node nao-root |
| `.env.banco.example` | Variaveis sem segredos reais |
| `banco/provisionar.sh` e `.sql` | Criacao condicional de usuario e banco |
| `banco/clonar-estrutura.sh` | Clone da estrutura do n8n, sem dados |
| `banco/migrations/` | Adaptacoes versionadas da automacao |
| `src/operacao/` | Consultas, migracoes, identidade e sessoes |
| `painel/` | Interface propria, sem alterar frontend do CRM |
| `DECISOES-FOLLOWUP-UNIFICADO.md` | Decisoes do futuro follow-up |

## Dokploy: procedimento para um deploy futuro autorizado

1. Publicar a revisao aprovada na branch de teste. **Push pode disparar deploy**
   se o Autodeploy estiver ligado; obter autorizacao antes de publicar.
2. Criar um servico NOVO do tipo **Docker Compose**, na homologacao. Selecionar
   este repositorio, branch `feat/automacao-local-base`, Compose Path
   `automacao/compose.yml`. Nao trocar o caminho do servico CRM existente.
3. Configurar nesse novo servico as envs de `.env.banco.example`. Dokploy nao
   transfere automaticamente as variaveis de outro servico.
4. Confirmar `AUTOMACAO_REDE_CRM`, alias `postgres` e URL interna do backend.
   O nome de rede no exemplo e referencia, nao foi verificado nesta sessao.
5. Usar dominio NOVO para o painel e prefixo Traefik exclusivo. Nao reutilizar
   dominio do CRM, n8n ou Evolution. O proxy precisa conseguir emitir HTTPS.
6. Revisar Preview Compose e executar Deploy somente com autorizacao.

Este arquivo usa `build` e `depends_on: service_completed_successfully`.
**Nao usar `docker stack deploy` nele.** O Dokploy constroi a imagem com a raiz
do repositorio como contexto e `automacao/Dockerfile`. Nao exige SSH/npm manual
na VPS nem muda a publicacao das imagens do CRM.

### Inicializacao automatica

1. O container temporario `banco` conecta ao PostgreSQL existente na rede privada.
2. Cria usuario proprio sem privilegios administrativos e banco proprio se ausentes.
3. Faz `pg_dump --schema-only` do banco interno do n8n e restaura no destino vazio.
4. Grava `automacao_infra.provisionamento` na mesma transacao da restauracao.
5. Somente apos sucesso, o container `automacao` inicia servidor e painel.
6. O servidor valida as tabelas de execucao e aplica migracoes proprias pendentes,
   com versao/checksum em `automacao_infra.migracao`.

Funciona mesmo com volume PostgreSQL existente: nao depende de executar de novo
o `/docker-entrypoint-initdb.d` do servidor original.

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
- O clone nao e um n8n executavel. Nao apontar n8n para o clone adaptado. O
  escritor de execucoes sera implementado na aplicacao TypeScript depois.
- Cliente PostgreSQL 15, como a referencia da stack. Confirmar versao real:
  cliente antigo nao consegue fazer dump de servidor mais novo.
- Extensoes/objetos que exigem privilegios adicionais fazem o clone falhar.
  Nao ha ampliacao automatica de privilegios; revisar com o responsavel.

### Variaveis do novo servico

`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: banco CRM e credencial
administrativa existente capaz de criar banco/usuario. Somente provisionador.

`N8N_DB_NAME`, `N8N_DB_USER`, `N8N_DB_PASSWORD`: origem com acesso para dump
completo. Somente provisionador. O servidor HTTP nao recebe essas credenciais.

`AUTOMACAO_DB_NAME`, `AUTOMACAO_DB_USER`, `AUTOMACAO_DB_PASSWORD`: destino novo.
Nomes minusculos, numeros e underscore, sem iniciar por numero.
`AUTOMACAO_DB_POOL_MAX`: padrao 3, limite 10 conexoes da aplicacao.

`AUTOMACAO_CRM_URL`: endereco que o servidor da automacao usa para consultar
login e permissoes no CRM. Nao e o endereco do painel. O default
`http://synapse-backend-internal:8080` usa o nome privado do backend no Docker;
funciona apenas se o novo servico estiver conectado a rede privada do CRM,
selecionada por `AUTOMACAO_REDE_CRM`. Tambem pode ser configurado com a URL
publica existente `https://crm-teste.187.77.47.30.sslip.io` (sem `/login`).

`AUTOMACAO_PAINEL_DOMINIO`: endereco publico NOVO para abrir o painel, sem
`https://` nem caminho. `AUTOMACAO_ROUTER_PREFIX`: identificador unico da rota
no proxy Traefik; nao e uma URL nem algo que o usuario precisa acessar.
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
do novo servico; criar os arquivos locais nao publica o painel.

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

O clone fica vazio e o executor vem depois: **nenhuma execucao de follow-up
aparecera agora**. Sem controles ficticios de executar/reprocessar. O adaptador
espera `execution_entity` com `id`, `status`, `startedAt`, `stoppedAt`; variantes
incompativeis sao recusadas explicitamente.

## Ativacao

`AUTOMACAO_HABILITADA=false` e `AUTOMACAO_FOLLOWUP_HABILITADO=false` por padrao.
Follow-up exige ambas `true`; ausente/vazio desliga, invalido impede boot.
Nesta etapa nao ha executor, mesmo com ambas `true`. Painel/saude continuam
acessiveis. Essas variaveis nao desligam o n8n existente.

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
representativo e verifica clone sem dados, repeticao e recusa de destino ocupado.

Nesta maquina nao ha Docker/psql. Provisionamento precisa passar pelo teste real
e pela validacao de rede, permissoes e versao na homologacao. Testes HTTP/build
nao substituem isso. Nenhum deploy foi feito.
