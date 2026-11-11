# FAQ no banco da automacao

## O que esta implementado

`migrations/V2__criar_faq_institucional.sql` cria `public.faq` no banco NOVO
da automacao com a estrutura dos arquivos locais da Estrutural:

- `id serial PRIMARY KEY`;
- `nome text NOT NULL`, com indice unico `faq_nome_idx`;
- `pergunta text NOT NULL`;
- `resposta text NOT NULL`.

Nao ha seed, textos de teste ou copia de conteudo de outro cliente. Uma tabela
vazia resolve a ausencia de estrutura, mas nao fornece respostas institucionais.
Os dados precisam ser cadastrados para cada filho.

Fonte: `Estrutural Vidros/fluxos n8n/estrutural-vidros/sql/faq.sql`, consultado
localmente. Nao foi executado diagnostico nos bancos para este levantamento.

## Quando a tabela e criada

1. O preparador `automacao-banco` cria o banco e o marcador, se ainda necessario.
2. Na mesma tarefa, executa `aplicar-migracoes.sh`, com V1/V2 montadas do repositorio
   por Docker configs. Banco ja clonado e preservado e tambem recebe as migracoes.
3. O executor verifica versoes/checksums e aplica somente as versoes pendentes.
4. Versao e checksum sao registrados em `automacao_infra.migracao`.

V1 nao foi alterada. Reiniciar a mesma versao nao recria a FAQ nem apaga registros.
V2 usa CREATE TABLE sem IF NOT EXISTS: se houver uma FAQ criada fora do historico,
a migracao falha e desfaz a transacao, sem aceitar uma estrutura desconhecida ou
apagar dados. Revisar o conflito em vez de editar uma migracao ja aplicada.

Publicar Git NAO executa SQL. Depois da publicacao autorizada, o deploy normal do
Stack leva os arquivos SQL ao preparador, sem publicar outra imagem e sem alterar
`SYNAPSE_IMAGE_TAG`. `AUTOMACAO_PROVISIONAR_REPLICAS=1` inicia a tarefa; ausente/zero
mantem o preparador desligado. `AUTOMACAO_REPLICAS` nao precisa ser ligado para
criar FAQ: app/painel/follow-up nao sao requisitos para migrar o banco.
O executor TypeScript continua compativel com o mesmo historico e checksums;
quando iniciar, apenas valida e pula as versoes ja aplicadas.
O procedimento de Stack continua em `../STACK-CRM.md`.

Configs Swarm sao imutaveis. O arquivo do preparador agora usa o config
`automacao-provisionar-sql-v2`; os SQL de V1/V2 nao foram alterados. Cada nova
migracao deve ser adicionada a pasta e montada nos configs do preparador.
Nenhum servico Java, imagem de CRM, volume ou init do PostgreSQL foi alterado.

## Credencial no n8n de homologacao

Nome: `HML PostgreSQL Automacao`. Usa `AUTOMACAO_DB_HOST/PORT` (defaults
`postgres:5432`) e `AUTOMACAO_DB_NAME/USER/PASSWORD` fornecidos pelo operador.
Esses valores ficam na credencial criptografada do n8n, nao nos exports/Git.
O cadastro nao cria o banco, nao aplica V2 e nao comprova conexao com PostgreSQL.

Ferramenta: `../homologacao/cadastrar-postgres-automacao.mjs`.
Sem `--apply`, so consulta metadados; com `--apply`, exige autorizacao e cria
somente essa credencial no n8n de TESTE, se ainda nao existir. Uma credencial de
mesmo nome ja existente e preservada, sem redefinir senha/configuracao.
CRM, n8n e bancos de sistema sao recusados como destino pela validacao local.

Os seis nodes de FAQ do HML foram remapeados, com autorizacao, para a credencial
da automacao. O remapeamento nao aplica SQL nem garante a existencia da tabela.
Memoria/follow-up/outros controles precisam de
migracoes proprias; V2 nao cria essas tabelas.

## Verificacao

Testes locais: `npm test`, `npm run typecheck` e
`node --test homologacao/credencial-automacao.test.mjs`.

O CI executa `bash test/banco-integracao.sh` depois do build. Em PostgreSQL
efemero, o teste roda o executor REAL de migracoes, verifica V1/V2, colunas,
ausencia de seed, repeticao preservando registros, unicidade de nome e NOT NULL.
Nao monta arquivos .env, nao usa credenciais reais nem publica portas.
Esta maquina nao tem daemon Docker: esse teste de banco depende do CI/ambiente
isolado com Docker, nao e comprovado apenas pelos testes unitarios locais.
