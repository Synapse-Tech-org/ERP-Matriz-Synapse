# Inventario das tabelas auxiliares da Estrutural

Levantamento em 10/11/2026. Somente leitura. Sem SQL executado, novas migrations,
troca de credenciais, execucao de fluxos, push ou deploy nesta etapa.

## Alcance e evidencias

- Consultadas pela API as definicoes ATUAIS dos fluxos da Estrutural em
  `https://n8n.187.77.47.30.sslip.io`. Nao sao apenas exports antigos.
- Os nodes auxiliares encontrados usam `estrutural_interno`. Isso identifica a
  credencial, nao comprova o nome fisico do banco nem o inventario do pg_catalog.
- Os DDL abaixo estao nos arquivos SQL locais ou nos proprios nodes atuais.
  Nao foi possivel consultar diretamente tabelas, volumes de dados ou constraints
  adicionais do banco em funcionamento. Nao afirmar que o banco tem SO estas oito.
- Os dados de negocio `lead`, `atendimento` e `mensagem` continuam no CRM;
  nao sao parte destas oito auxiliares.
- O clone schema-only do produto n8n nao inclui automaticamente estas tabelas
  especificas da automacao, apesar do nome `n8n_chat_histories`.

## Problema atual confirmado na homologacao

Execucao 102, 10/11/2026, 12:28:35 America/Sao_Paulo: node
`Consultar memoria da sessao`, credencial `HML PostgreSQL CRM`, erro
`relation "public.n8n_chat_histories" does not exist`.

Os nodes `Consultar memoria da sessao`, `Postgres Chat Memory`,
`Resetar memoria Postgres` e `Limpar memoria e follow-ups do #sair` do orquestrador
HML ainda usam o CRM. A FAQ ja usa `HML PostgreSQL Automacao`.
Logo, criar memoria na automacao SEM trocar seus nodes nao corrigiria a consulta
ao CRM. O node de limpeza do #sair depende tambem de `follow_ups_temporary`.
Nao remapear nodes que finalizam atendimento/desvinculam lead no CRM.

## Resumo

| Tabela em public | Funcao | Consumidores identificados |
| --- | --- | --- |
| faq | Textos institucionais e horario de expediente | EV-01, EV-02, EV-03, EV-15 |
| n8n_chat_histories | Memoria das conversas por sessao | EV-01 e sua copia |
| follow_ups_temporary | Ciclo, reserva e comprovantes de follow-up | EV-06, EV-15, limpeza do EV-01 |
| follow_up_opt_outs | Recusa persistente de follow-up por lead | EV-00, EV-06 |
| ev05_solicitacoes_automacao | Deduplicacao e estado de pedidos de resumo | EV-05 |
| ev07_envios_automaticos | Reservas/comprovantes de envios recorrentes | EV-07, atualmente desativado na origem |
| ev17_segmentacoes | Controle de alteracoes de etapa por inatividade | EV-17 |
| ev17_cursores | Ponto de continuacao da varredura | EV-17 |

Nos DDL levantados nao ha FOREIGN KEY entre estas tabelas ou para o CRM.
Campos como lead_id/atendimento_id sao referencias logicas. Campos de estado
sao text, sem ENUM/CHECK de valores nos DDL examinados.

## 1. faq

Fonte: `Estrutural Vidros/fluxos n8n/estrutural-vidros/sql/faq.sql` e consultas
atuais EV-01/02/03/15. Estrutura ja registrada na V2 da automacao.

```sql
CREATE TABLE public.faq (
  id serial PRIMARY KEY,
  nome text NOT NULL,
  pergunta text NOT NULL,
  resposta text NOT NULL
);
CREATE UNIQUE INDEX faq_nome_idx ON public.faq (nome);
```

Os arquivos definem estrutura, nao registros. O levantamento nao extraiu textos
institucionais do banco de producao. Tabela vazia nao fornece horarios/respostas.

## 2. n8n_chat_histories

Fonte do DDL: `sql/todos_sql_rodados.sql`. Uso confirmado no EV-01 atual,
incluindo node LangChain `Postgres Chat Memory` com janela de contexto 10.

```sql
CREATE TABLE public.n8n_chat_histories (
  id serial PRIMARY KEY,
  session_id varchar(255) NOT NULL,
  message jsonb NOT NULL,
  created_at timestamptz NULL DEFAULT now()
);
```

O arquivo nao declara indice adicional para session_id. A tabela real pode ter
indices adicionais ou ter sido preparada pelo node de memoria; isso nao foi
inspecionado via catalogo. `created_at` permite NULL no DDL local.
O node de memoria nao especifica tableName no JSON consultado; as consultas SQL
do mesmo fluxo referenciam explicitamente public.n8n_chat_histories.

## 3. follow_ups_temporary

Fonte principal: node atual `Garantir tabela anti-repeticao`, EV-06
`NTMZ14d3pNNuo2o0`. A versao atual contem duas colunas ausentes no SQL antigo:
`encerrado_em` e `motivo_encerramento`.

```sql
CREATE TABLE public.follow_ups_temporary (
  id bigserial PRIMARY KEY,
  follow_up_config_id text NOT NULL,
  clinica_id integer NOT NULL DEFAULT 1,
  paciente_id text,
  lead_id text,
  titulo text NOT NULL DEFAULT 'Follow-up de atendimento',
  descricao text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  crm_atendimento_id text NOT NULL,
  crm_paciente_id text,
  regra_followup_nome text,
  lead_ultima_mensagem_em timestamptz,
  lead_ultima_mensagem_chave text NOT NULL DEFAULT 'SEM_RESPOSTA_LEAD',
  ultima_mensagem_base_em timestamptz,
  mensagem_enviada text,
  whatsapp_message_id text,
  crm_mensagem_id text,
  status text NOT NULL DEFAULT 'ENVIADO',
  enviado_em timestamptz,
  encerrado_em timestamptz,
  motivo_encerramento text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX follow_ups_temporary_ev_idempotencia_idx
  ON public.follow_ups_temporary
  (crm_atendimento_id, follow_up_config_id, lead_ultima_mensagem_chave);
CREATE INDEX follow_ups_temporary_ev_atendimento_idx
  ON public.follow_ups_temporary (crm_atendimento_id, enviado_em DESC);
```

O node tambem tem ALTER TABLE ADD COLUMN IF NOT EXISTS para compatibilidade com
estruturas anteriores. Nesses ALTER, follow_up_config_id e crm_atendimento_id
sao adicionados sem NOT NULL; portanto, o DDL atual nao prova a nulabilidade
efetiva de instalacoes antigas. Os campos clinica/paciente sao heranca existente,
nao uma nova exigencia definida para todos os filhos.

## 4. follow_up_opt_outs

Fontes: nodes atuais EV-00 `Bloquear follow-up por recusa` e EV-06
`Garantir tabela anti-repeticao`.

```sql
CREATE TABLE public.follow_up_opt_outs (
  lead_id text PRIMARY KEY,
  wa_id text,
  atendimento_id text,
  recusado_em timestamptz NOT NULL DEFAULT now(),
  origem text NOT NULL DEFAULT 'BOTAO_NAO',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX follow_up_opt_outs_wa_idx
  ON public.follow_up_opt_outs (wa_id);
```

O indice por wa_id aparece no EV-06; o CREATE do EV-00 sozinho nao o declara.
O bloqueio e por lead_id (PK), nao por regra ou por execucao.

## 5. ev05_solicitacoes_automacao

Fonte: EV-05 atual, node `Garantir controle de solicitacoes EV05`, e SQL local
`EV-05-controle-solicitacoes.sql`.

```sql
CREATE TABLE public.ev05_solicitacoes_automacao (
  solicitacao_id uuid PRIMARY KEY,
  lead_id uuid NOT NULL,
  atendimento_id uuid NOT NULL,
  execucao_id text NOT NULL,
  estado text NOT NULL DEFAULT 'PENDENTE',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
```

Sem indices adicionais declarados. Controla a solicitacao, nao contem coluna de
texto de resumo/prompt neste DDL.

## 6. ev07_envios_automaticos

Fonte: node atual `Garantir idempotencia dos envios EV-07`. O fluxo EV-07 esta
desativado na Estrutural na consulta desta data; nao foi ativado para mapear.

```sql
CREATE TABLE public.ev07_envios_automaticos (
  id bigserial PRIMARY KEY,
  categoria text NOT NULL,
  referencia_id text NOT NULL,
  lead_id text NOT NULL,
  ciclo_chave text NOT NULL,
  telefone text NOT NULL,
  texto_enviado text NOT NULL,
  payload_meta jsonb NOT NULL,
  status text NOT NULL DEFAULT 'RESERVADO',
  execucao_n8n_id text,
  meta_message_id text,
  reservado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ev07_envios_automaticos_idempotencia_idx
  ON public.ev07_envios_automaticos
  (categoria, referencia_id, lead_id, ciclo_chave);
CREATE INDEX ev07_envios_automaticos_status_idx
  ON public.ev07_envios_automaticos (status, updated_at);
```

`payload_meta` e `meta_message_id` sao nomes do schema da origem. Nao foram
renomeados nem adaptados aqui para Evolution. A existencia do DDL em um fluxo
desativado nao comprova que a tabela esteja criada no banco em funcionamento.

## 7. ev17_segmentacoes

Fonte: EV-17 atual, node `Garantir controle interno EV17`, e `EV-17-controle.sql`.

```sql
CREATE TABLE public.ev17_segmentacoes (
  atendimento_id uuid NOT NULL,
  mensagem_ia_id uuid NOT NULL,
  mensagem_ia_em timestamptz NOT NULL,
  lead_id uuid NOT NULL,
  execucao_id text NOT NULL,
  estado text NOT NULL DEFAULT 'RESERVADO',
  etapa_id uuid,
  chave_crm text,
  modelo text,
  confianca double precision,
  http_status integer,
  input_tokens integer,
  output_tokens integer,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (atendimento_id, mensagem_ia_id, mensagem_ia_em)
);
CREATE INDEX ev17_segmentacoes_execucao_idx
  ON public.ev17_segmentacoes (execucao_id);
```

## 8. ev17_cursores

Mesmas fontes do EV-17.

```sql
CREATE TABLE public.ev17_cursores (
  chave text PRIMARY KEY,
  ultimo_atendimento_id text NOT NULL DEFAULT '',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
```

Sem indices adicionais declarados.

## Implementacao posterior autorizada

Apos este levantamento, o usuario autorizou criar migrations das auxiliares.
V3-V9 foram preparadas em `banco/migrations/`, alem da FAQ ja atendida pela V2.
Ver `../banco/TABELAS-AUXILIARES.md`. Criar arquivos nao significa aplicar no
servidor: nao houve SQL, remapeamento, push ou deploy nesta etapa.

## Limites preservados

- Nao importar conteudo, memoria ou registros de clientes da Estrutural.
- Nao mover tabelas/consultas de negocio do CRM.
- Nao trocar credenciais dos nodes de memoria/controles nesta etapa.
- Nao afirmar que este levantamento substitui um dump schema-only do banco real:
  triggers, grants, indices extras e alteracoes manuais precisam de introspeccao.
