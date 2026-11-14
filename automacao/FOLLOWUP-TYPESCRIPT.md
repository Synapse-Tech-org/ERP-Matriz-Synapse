# Follow-up unificado em TypeScript

Implementacao de 10/11/2026, branch `feat/automacao-local-base`.
Decisoes: [DECISOES-FOLLOWUP-UNIFICADO.md](DECISOES-FOLLOWUP-UNIFICADO.md).
Nao altera os fluxos de entrada do n8n, Java ou frontend do CRM.

## O que substitui

Substitui SOMENTE o fluxo agendado de follow-up Femina/Estrutural. O n8n continua
recebendo mensagens, interpretando `Sim`/`Nao` e registrando recusas. A automacao
le esses mesmos controles e encerra pela API apenas quando falta resposta ao
follow-up comprovado. Nenhum webhook de WhatsApp foi criado aqui.

Um codigo por matriz, sem condicional por cliente. Cada filho usa seu banco,
suas regras e credenciais. Nao ha consultas entre filhos.

## Percurso de uma rodada

1. Os DOIS toggles precisam estar ligados. A inicializacao valida conexoes e
   configuracoes; aguarda o banco provisionado e aplica migracoes pendentes.
2. pg-boss gera um pulso por minuto. A trava PostgreSQL e o ultimo inicio
   persistido aplicam o intervalo configurado (padrao 2 minutos). Nao ha envio
   imediato ao ligar: aguarda o agendamento.
3. Busca configuracoes e regras pela API interna. Falha de API ou contrato
   invalido interrompe a rodada; nao vira configuracao vazia.
4. Recupera registros CRM pendentes de mensagens JA comprovadas, sem reenviar.
5. Busca atendimentos ativos no PostgreSQL CRM por paginas e cursor. A ultima
   mensagem e lida integralmente, nao pela previa da lista. Pagina nao limita
   quantos candidatos serao examinados na rodada.
6. Dois candidatos sao avaliados simultaneamente. Ambos compartilham o teto
   persistido de envios da rodada. Recusas, falta de resposta, janela e regras
   sao avaliadas antes de reservar qualquer envio.
7. Entre regras vencidas, escolhe o menor prazo ainda nao usado no ciclo;
   desempata por ID. A ultima resposta do lead identifica o ciclo.
8. Revalida a conversa, reserva a chave local e pede autorizacao ao CRM.
   Negativa do CRM nao pode ser contornada pelo limite local ou regra de teste.
9. Revalida de novo. Grava `EM_ENVIO` ANTES da chamada unica ao provedor.
   Guarda o identificador retornado; depois registra a mensagem no CRM.
10. Persiste resultados e cursor. Se a ultima mensagem for o follow-up
    comprovado, nao manda o proximo automaticamente; avalia encerramento por
    falta de resposta usando a hora do comprovante e a API do CRM.

Se a conexao que segura a trava cair, novos efeitos sao interrompidos. Reenvio
automatico de resultado incerto nao existe. Uma chamada externa ja em andamento
nao pode ser desfeita: o controle persistido impede repeti-la cegamente.

## Modulos e interfaces

| Arquivo em `src/followup/` | Responsabilidade |
| --- | --- |
| `padroes.ts` | Defaults visiveis e chaves dos parametros CRM |
| `configuracao.ts` | Env, validacao e selecao do provedor |
| `configuracao-crm.ts` | Contrato CRM e fallback por campo |
| `contratos.ts` | Portas de consulta, controle, CRM e envio |
| `avaliar.ts` | Regras puras, sem HTTP, banco ou framework |
| `processar-atendimento.ts` | Ordem do caso de uso e revalidacoes |
| `atendimentos-postgres.ts` | Consulta compartilhada CRM com contexto RLS de servico |
| `controle-postgres.ts` | Reserva, comprovante e limite atomico |
| `crm-http.ts` | Contratos internos existentes, sem mudar o CRM |
| `provedores.ts` | Payloads Evolution, Z-API e Meta |
| `http.ts` | Timeout, circuit breaker e erros sem segredos |
| `rodada.ts` | Trava, cursor, dois candidatos, historico e retencao |
| `runtime.ts` | Composicao das dependencias e ciclo de vida pg-boss |

As interfaces permitem testar sem rede e trocar um adaptador sem reescrever
as regras. Nao ha framework de integracao novo nem dependencias npm adicionais.

## De onde vem cada configuracao

Env existente vence quando fornecida. Parametros de negocio vem do CRM;
campo ausente, nulo ou vazio usa o default declarado em `padroes.ts` e registra
a chave em `padroes_utilizados`. Valor invalido e erro, nao fallback.
Zero e respeitado onde tem significado. Os textos das campanhas NAO sao
inventados quando a API de regras retorna vazia.

Parametros consumidos em `GET /internal/v1/automation-config`, em
`parametros: [{ chave, valor }]`:

| Chave CRM | Default | Observacao |
| --- | --- | --- |
| `followup.limite_envios_por_rodada` | 10 | Zero bloqueia novos envios; nao impede registro/encerramento |
| `followup.encerrar_pos_followup_minutos` | 30 | Zero desliga encerramento por falta de resposta |
| `followup.janela_texto_livre_minutos` | 1430 | Meta sempre respeita janela; nao envia template fora dela |
| `followup.botao_sim_id` | `ev06_followup_sim` | Env especifica pode sobrescrever |
| `followup.botao_nao_id` | `ev06_followup_nao` | Env especifica pode sobrescrever |
| `followup.botao_sim_titulo` | `Sim` | Ate 20 caracteres |
| `followup.botao_nao_titulo` | `Nao` | Ate 20 caracteres |

Essas chaves sao o contrato consumido pela automacao. NAO foi criado cadastro,
seed ou campo novo na interface Java/CRM. Se nao vierem no endpoint, os defaults
acima funcionam e aparecem no historico. Regras/textos/prazos continuam vindo
de `/internal/v1/regras/follow-up`. Suporta `{nome}`, `{{nome}}` e
`{{primeiro_nome}}`; placeholder desconhecido impede aquele envio.

## Env e Dokploy

Exemplo SEM segredos: [followup.env.example](followup.env.example).
O `.env.example` existente contem valores reais e nao foi alterado nem publicado
nesta entrega. O programa nao carrega automaticamente arquivos `.example`.

Nao e preciso adicionar nenhuma env nova para manter o executor desligado.
Nao trocar a tag conjunta do CRM. A imagem da automacao pode estar fixada por
`AUTOMACAO_IMAGE_DIGEST`; nesse caso um push nao seleciona a imagem nova.
O artifact `automacao-hml-imagem` do CI informa a referencia publicada.

Para uma futura ativacao autorizada:

- `AUTOMACAO_HABILITADA=true` E `AUTOMACAO_FOLLOWUP_HABILITADO=true`.
- `AUTOMACAO_REPLICAS=1` e banco provisionado com `AUTOMACAO_DB_*` existentes.
- `AUTOMACAO_CRM_URL=http://synapse-backend-internal:8080` na Stack principal.
  Precisa alcancar `/internal/v1`, que NAO e publico pelo Traefik. Uma URL
  publica que funciona para login nao comprova acesso aos contratos internos.
- `SYNAPSE_TOKEN_INTERNO`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`,
  `POSTGRES_USER`, `POSTGRES_PASSWORD`: reutilizados para o CRM do proprio filho.
- `WHATSAPP_PROVEDOR=evolution`: exige `EVOLUTION_HABILITADO=true`,
  `EVOLUTION_URL_BASE`, `EVOLUTION_INSTANCIA` (NOME), `EVOLUTION_API_KEY`.
- `WHATSAPP_PROVEDOR=z-api`: exige `Z_API_HABILITADO=true`, `Z_API_INSTANCIA_ID`,
  `Z_API_TOKEN` e `Z_API_CLIENT_TOKEN`; usa `Z_API_URL_BASE` quando informada.
  `Z_API_ENVIAR_CLIENT_TOKEN=false` omite esse header apenas se deliberadamente configurado.
- `WHATSAPP_PROVEDOR=meta-cloud` (aceita tambem `meta`): `WHATSAPP_NUMERO`
  e o phone number ID, `WHATSAPP_TOKEN`, `WHATSAPP_URL_BASE` com versao Graph.
- `WHATSAPP_RESTRICAO_NUMEROS_HABILITADA=true` e
  `WHATSAPP_NUMEROS_PERMITIDOS` limitam destinatarios. Padrao e restringir;
  lista vazia com restricao ligada nao permite nenhum destinatario.

Novas envs opcionais, ja encaminhadas no Compose/Stack:

| Env | Default/exemplo |
| --- | --- |
| `AUTOMACAO_FOLLOWUP_INTERVALO_MINUTOS` | `2` |
| `AUTOMACAO_FOLLOWUP_TAMANHO_PAGINA` | `100` |
| `AUTOMACAO_FOLLOWUP_RETENCAO_DIAS` | `90` |
| `AUTOMACAO_FOLLOWUP_HTTP_TIMEOUT_MS` | `15000` |
| `AUTOMACAO_FOLLOWUP_BOTAO_SIM_ID` | vazio: consultar CRM/default |
| `AUTOMACAO_FOLLOWUP_BOTAO_NAO_ID` | vazio: consultar CRM/default |
| `AUTOMACAO_FOLLOWUP_TESTE_LOCAL_HABILITADO` | `false` |
| `AUTOMACAO_FOLLOWUP_TESTE_LEAD_ID` | vazio: UUID do lead autorizado |
| `AUTOMACAO_FOLLOWUP_TESTE_MINUTOS` | `10` |
| `AUTOMACAO_FOLLOWUP_TESTE_TEXTO` | vazio: texto definido para teste |

A regra local so entra se explicitamente ligada E a API retornar zero regras.
Fica restrita ao lead informado e ainda depende da reserva CRM e da allowlist.
Ela NAO substitui configuracao em caso de 401, timeout ou resposta malformada.

Compatibilidade dos botoes: Estrutural usa `ev06_followup_sim`/`ev06_followup_nao`.
Femina usa `fmna_followup_sim`/`fmna_followup_nao`; configurar as duas envs acima
ou as chaves CRM correspondentes antes de migrar esse filho. Nao mudar o codigo.

## Banco e painel

- Dados de negocio: tabelas existentes `public.lead`, `atendimento`, `mensagem`
  no banco CRM. Consulta em transacao read-only com `app.papel=SERVICO`.
- Controle: mesmas `public.follow_ups_temporary` e `follow_up_opt_outs` no banco
  da automacao. Na transicao, confirmar que o n8n compartilha esse destino.
- V10: acrescenta identificacao do executor, chave, botoes e motivo aos controles;
  cria `automacao_infra.followup_rodada`/`followup_etapa` para cursor e historico.
- O clone n8n permanece preservado. Nao fabricamos `execution_data` com formato
  interno de nodes: o painel combina as execucoes clonadas com as rodadas TS.
- pg-boss cria suas tabelas em `automacao_fila`, somente com executor habilitado.
- Migracoes sao versionadas/checksummed, transacionais e serializadas. Nao precisam
  de `IF NOT EXISTS` para esconder divergencia: a versao ja aplicada e pulada;
  estrutura inesperada deve falhar visivelmente. Nao editar versao aplicada.
- Retencao remove historico concluido antigo, nao recusas/comprovantes ou rodadas
  com efeitos pendentes/incertos. Nao define politica de expurgo dessas evidencias.
- Pool do painel usa `AUTOMACAO_DB_POOL_MAX` (padrao 3); executor usa outro pool
  com minimo 3 e mesmo limite configurado; CRM usa 2. Com defaults: ate 8 conexoes
  totais, nao 3 para todo o processo. HTTP/painel/candidatos estao no mesmo container.

Painel em `https://<AUTOMACAO_PAINEL_DOMINIO>/painel/`, login CRM existente.
Mostra rodadas e resultados agrupados. `ENVIO_INCERTO` nao significa sucesso;
`ENVIADO_REGISTRO_CRM_PENDENTE` significa provedor aceitou, registro ainda pendente.
IDs TS possuem prefixo `fu_`. Sem controles manuais de reenvio/liberacao nesta entrega.

## Falhas, retomada e limites

- Teto atingido: candidato nao ganha reserva e pode ser avaliado na proxima rodada.
- CRM negou por cooldown/teto/tipo desligado: fica `ADIADO`, libera a vaga local.
- Conflito de chave ou ocorrencia no CRM: nao envia novamente.
- Queda depois da reserva ou chamada sem comprovante: bloqueia o ciclo e exige
  investigacao. Nao presumir que timeout significa mensagem nao enviada.
- Provedor aceitou e CRM falhou: proxima rodada repete so o registro CRM.
- Reinicio: cursor e limite persistem; reprocessamento revalida o estado atual.
- Encerramento exige mesmo ciclo, texto completo, prazo e ID da ultima mensagem
  CRM igual ao comprovante. Resposta ou intervencao da equipe cancela a decisao.
- A ultima revalidacao e a chamada externa nao formam transacao distribuida:
  existe uma pequena janela de concorrencia, pois a API atual nao oferece uma
  operacao condicional atomica com a versao da conversa. Nao prometemos exactly-once
  ponta a ponta nem cancelamento de mensagem ja aceita pelo provedor.
- Cadastro sem mensagem anterior do cliente, telefone invalido, regra invalida
  ou placeholder desconhecido nao gera envio. Nao enviar templates Meta nesta fase.

## Validacao e virada autorizada

Testes locais: `npm test`, `npm run typecheck`, `npm run build`,
`npm run test:runtime`, `npm run test:stack` (este precisa apenas do CLI Docker).
Teste com PostgreSQL real: `bash test/banco-integracao.sh`, exige daemon Docker.
Cria fixture isolado, sem `.env`, sem portas publicadas, sem chamadas WhatsApp.
Valida migracoes, concorrencia, RLS, cursor, teto, recusa, painel e handler pg-boss.
O CI executa esse teste antes de publicar a imagem. Consultar o resultado da run;
nao confundir testes locais com verificacao remota.

Antes do primeiro teste real, revisar imagem, `/health/readiness`, acesso interno,
regras, IDs dos botoes e numero permitido. Desligar SOMENTE o agendamento de
follow-up antigo desse filho antes de ativar o TS; manter chatbot/respostas n8n.
Nem a flag TS nem o deploy desativam o agendamento n8n automaticamente.

Testar envio, resposta, recusa, limite e encerramento com destinatario autorizado.
Os testes de codigo usam provedores falsos: a entrega real dos botoes Evolution,
Z-API e Meta ainda depende de homologacao. Rollback: desligar os toggles, esperar
terminar chamadas em andamento, preservar o banco e revisar comprovantes antes
de reativar o agendamento anterior. Nenhuma ativacao ou deploy manual nesta tarefa.
