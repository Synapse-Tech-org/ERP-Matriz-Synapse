# Publicacao da imagem da automacao na homologacao

## Problema corrigido

O Stack tentava iniciar `ghcr.io/synapse-auto/erp-matriz-synapse-automacao:ca86d39`.
Essa revisao do repositorio nao contem a pasta automacao. O log de deploy indicou
falha de acesso ao manifesto; sem acesso autenticado ao registry, isso sozinho
nao distingue imagem ausente de permissao insuficiente.

O pipeline so publicava imagens em main ou quando acionada a publicacao geral.
Portanto, fazer push dos arquivos TypeScript na branch de teste nao entregava
uma nova imagem para executar o painel. Migrations continuam funcionando porque
o preparador usa a imagem pronta do PostgreSQL e arquivos SQL montados.

## Publicacao isolada

O job `imagem_automacao_hml` foi adicionado ao CI existente. Ele:

1. Roda somente em push da branch `feat/automacao-local-base`, ou via disparo
   manual nessa branch com `publicar_automacao_hml=true`.
2. Aguarda sucesso dos jobs de testes `automacao` e `infra`.
3. Constroi apenas `automacao/Dockerfile`, usando GitHub Actions e GHCR existentes.
4. Publica no namespace atual do dono do repositorio, convertido para minusculas.
   Nao depende do nome antigo da organizacao apos a transferencia do repositorio.
5. Usa tag `hml-<SHA completo>` e informa o digest exato da imagem publicada.
6. Entrega o artefato `automacao-hml-imagem` e resumo com duas linhas de env.

Nao publica imagens de backend/frontend, nao altera a rotina de main nem roda
SSH, Dokploy ou comandos de deploy. A publicacao geral existente continua igual.
Nao foram adicionadas assinaturas ou servicos externos pagos. Custos/quota de
Actions e GHCR seguem as condicoes da conta ja utilizada pelo projeto.

## Selecionar somente a imagem da automacao

Apos publicacao bem-sucedida, usar EXATAMENTE as duas linhas do artefato:

```dotenv
AUTOMACAO_IMAGE_REPOSITORIO=ghcr.io/organizacao-atual/erp-matriz-synapse-automacao
AUTOMACAO_IMAGE_DIGEST=@sha256:HASH_COMPLETO_PUBLICADO_PELO_CI
```

Os valores acima sao exemplos, nao referencias de uma imagem ja publicada.
`AUTOMACAO_IMAGE_REPOSITORIO` e um override opcional novo: ausente, mantem o
repositorio anterior e nao muda o comportamento dos outros filhos.
`AUTOMACAO_IMAGE_DIGEST` ja existia. O digest seleciona o conteudo exato da
automacao, sem alterar `SYNAPSE_IMAGE_TAG`, que continua selecionando o CRM.
A sintaxe final da imagem e `repositorio:tag-do-crm@sha256:digest-da-automacao`;
com digest, e esse conteudo que o Docker seleciona, nao o conteudo da tag.
Nenhuma interpolacao de variaveis aninhadas foi introduzida no Stack.

O registry do Dokploy precisa ter acesso de leitura ao pacote na organizacao
atual. Nao tornar o pacote publico nem trocar credenciais do registry sem
autorizacao. Erros `denied`/`unauthorized` exigem revisar esse acesso; nao sao
resolvidos repetindo migrations ou instalando Node na VPS.

## Checklist completo do painel

```dotenv
AUTOMACAO_REPLICAS=1
AUTOMACAO_PAINEL_HABILITADO=true
AUTOMACAO_PAINEL_DOMINIO=painel-automacao-hml.187.77.47.30.sslip.io
AUTOMACAO_ROUTER_PREFIX=automacao-hml
AUTOMACAO_HABILITADA=false
AUTOMACAO_FOLLOWUP_HABILITADO=false
```

Preservar os valores ja configurados de `AUTOMACAO_DB_NAME/USER/PASSWORD` e as
variaveis de identificacao do CRM. Nao copiar segredos para documentacao ou Git.
`AUTOMACAO_CRM_URL` usa por padrao `http://synapse-backend-internal:8080`;
memoria 768M, schema public, pool 3 e portas internas ja tem defaults no Stack.
O preparador do banco e independente: `AUTOMACAO_PROVISIONAR_REPLICAS=1` aplica
migrations; nao e o processo que atende HTTP ou serve o painel.

Depois de selecionar a imagem, o deploy normal exige autorizacao propria.
Conferir container `automacao` ativo/saudavel, log `BANCO_AUTOMACAO_PRONTO`,
HTTPS valido, `/painel/`, login e permissoes do CRM. Isso nao libera follow-up.

## Limites da verificacao local

Testes locais verificam gatilhos/permissoes do job, isolamento da imagem,
interpolacao real do Docker Stack, compilacao e inicializacao do TypeScript.
Sem daemon Docker local, build/container e PostgreSQL real dependem do CI.
Nao afirmar que imagem foi publicada ou painel esta online apenas pelo commit.
