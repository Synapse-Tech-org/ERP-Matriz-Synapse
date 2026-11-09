# Decisoes do follow-up unificado

Consolidacao da conversa em 09/11/2026. Este documento distingue decisoes,
propostas e pendencias; nao afirma que os recursos estejam implementados.

## 1. Objetivo e limites

- Migrar inicialmente SOMENTE o follow-up para TypeScript, unificando Femina e
  Estrutural, com interfaces/modulos reutilizaveis, SOLID e codigo legivel.
- Permanecer no monorepo ERP-Matriz-Synapse, na branch de trabalho
  `feat/automacao-local-base`. Um codigo atende os filhos com configuracoes proprias.
- Seguir os documentos `necessidades-crm-automacao-typescript.pdf` e
  `REUNIAO-ALINHAMENTO-AUTOMACAO-TYPESCRIPT-CRM-VPS.md`, considerando as decisoes
  posteriores registradas aqui.
- Preservar comportamentos comuns dos fluxos existentes. Perguntar sobre
  divergencias reais ou comportamentos novos, sem reabrir escolhas equivalentes.
- Preparar Dockerfile, Compose, testes e documentacao no repositorio.
- Nao fazer deploy, ativar fluxos ou enviar mensagens sem autorizacao especifica.
  Push na branch monitorada pode acionar o Dokploy: nao fazer push automaticamente.
- Regra geral: API n8n somente para consulta. O pedido posterior de importar
  fluxos no n8n de testes exige delimitar a excecao; nao autoriza escrita em producao.

## 2. Fontes verificadas

| Fonte | Identificador | Observacao |
| --- | --- | --- |
| Follow-up Femina | `aKmYgITO0HpAyZsX` | 20 nodes; consulta SQL; envio Z-API |
| Follow-up Estrutural | `NTMZ14d3pNNuo2o0` | 29 nodes; consulta API; envio Meta |
| Entrada Estrutural | `FNCKnkLKsvU2qMKL` / `uVhIKUyw3czlhuIB` | Tratamento das respostas aos botoes conferido via API somente leitura |
| Modulo Femina | `E6bnCcnLmAF8PMTg` / `ve0Ex75DfXFVpdL8` | Tratamento das respostas aos botoes conferido via API somente leitura |

O anexo `Estrutural Vidros/fluxos n8n/femina/Envio de FollowUps.json` e um fluxo
antigo da Femina, com 12 nodes, e nao corresponde ao follow-up remoto Estrutural.
Nao incorporar silenciosamente sua verificacao de agendamentos ao escopo novo.
As tres pranchetas do usuario orientam a sequencia do follow-up unificado.

## 3. Configuracao e ativacao

- Reutilizar nomes de env existentes para conexoes, URLs, provedor e credenciais.
  Nao colocar valores de cliente ou segredos no codigo.
- Regra geral solicitada: configuracao existente em env vem de env; caso contrario,
  vem do CRM. As decisoes especificas abaixo prevalecem sobre essa regra geral.
- Textos e prazos das regras de follow-up vem do CRM.
- Limite de novos envios por rodada vem do CRM, NAO de env. Ausencia do campo
  usa fallback de 10; falha na consulta ao CRM nao significa campo ausente.
- Confirmacao de recusa: texto do CRM; quando ausente/vazio, usar como fallback
  a mensagem existente da Femina, sem marca de cliente:
  `Tudo bem. Encerramos este atendimento por enquanto. Quando precisar, estamos a disposicao.`
- Registrar no historico quando o fallback de mensagem for utilizado.
- Manter alternativa de regra local de teste quando o CRM retornar sem regras,
  restrita ao lead de teste e parametrizada por env, sem IDs de producao fixos.
  Essa alternativa nao pode contornar os toggles gerais nem outras negativas
  explicitas de autorizacao de envio do CRM.
- `AUTOMACAO_HABILITADA` e `AUTOMACAO_FOLLOWUP_HABILITADO` precisam estar `true`.
  Ausencia deixa desligado; valor invalido impede inicializacao.
- Consulta do painel permanece disponivel com processamento desligado.

## 4. Selecao e comportamento do follow-up

- Buscar atendimentos dos dois clientes por uma consulta SQL compartilhada,
  parametrizada e ligada ao PostgreSQL da respectiva instancia.
- Regras continuam vindo da API do CRM; SQL nao substitui essa configuracao.
- Rodada a cada 2 minutos, intervalo configuravel por env.
- Avaliar a falta de resposta a partir da ultima mensagem enviada pela equipe/IA;
  a ultima mensagem do cliente identifica o ciclo e a janela de comunicacao.
- Se varias regras venceram, escolher a de menor prazo ainda nao enviada,
  seguindo Estrutural. Desempate estavel por ID. Nao criar opcao disso no CRM.
- Preservar a regra comum: se a ultima mensagem for reconhecida como follow-up,
  nao disparar outro apenas pelo passar do tempo; avaliar o encerramento.
- Reconhecimento segue a comparacao da Estrutural, CORRIGIDA para comparar o
  texto efetivamente enviado, com variaveis substituidas, ao conteudo completo
  da ultima mensagem, nao a uma previa truncada.
- Para encerramento, usar o instante do envio registrado e o ciclo da ultima
  resposta do cliente, como na Estrutural. Prazo configurado no CRM.
- Finalizar atendimento pela API do CRM, como na Femina, nao por UPDATE direto.
- Revalidar atendimento e novas interacoes antes de enviar ou finalizar.
- Nao transformar o follow-up em uma migracao do chatbot completo.

## 5. Respostas do cliente e recusas

- `Sim`: preservar o processamento normal da conversa. O tratamento de follow-up
  nao forca transferencia para humano nem substitui o orquestrador existente.
- `Nao`: persistir recusa, enviar confirmacao conforme secao 3 e finalizar pela API.
- A recusa bloqueia novos follow-ups ate autorizacao explicita. Nova conversa ou
  mensagem comum NAO remove o bloqueio.
- Essa regra substitui a limpeza automatica do bloqueio encontrada na Femina.
- Desbloqueio manual deve registrar evidencia de autorizacao, operador, data e motivo.
- Nao fechar outro atendimento por causa de uma resposta a um follow-up antigo.
- Mecanismo exato de consumo dessas respostas no TypeScript ainda precisa ser
  fechado; o CRM recebe WhatsApp. Nao presumir migracao de todo webhook/chatbot.

## 6. Envio, comprovantes e falhas

- TypeScript envia diretamente ao provedor. Interface comum com implementacoes
  Z-API, Meta e Evolution, escolhidas pela configuracao da instancia.
- Usar contratos existentes do CRM para reserva previa e registro posterior.
- Registrar origem FOLLOW_UP, regra, execucao, identificador do provedor e botoes.
- Duas execucoes nao podem autorizar o mesmo efeito externo.
- Persistir o comprovante retornado pelo provedor antes de concluir o registro CRM.
- Provedor confirmou, CRM falhou: repetir SOMENTE o registro, idempotentemente.
- Timeout/resultado incerto: bloquear, mostrar pendencia no painel e conciliar
  mediante evidencia. Nao reenviar automaticamente e nao iniciar encerramento
  com base nesse envio incerto.
- Aceite pelo provedor nao prova entrega ou leitura pelo cliente.
- O CRM local ja registra BOTOES/LISTA, mas seu modelo de envio inspecionado nao
  oferece o mesmo contrato de saida interativa. Nao confundir registro com envio.
- Evolution 2.3.7 possui implementacao de botoes; entrega e resposta reais precisam
  de teste autorizado na homologacao. Nao considerar HTTP 200 prova suficiente.

## 7. Execucao, retomada e retencao

- pg-boss/PostgreSQL e dois workers por filho, conforme reuniao.
- HTTP, painel e workers compartilham o orcamento de CPU. O teto combinado dos
  workers foi planejado em 512 MiB; dimensionamento final depende de testes.
- Reutilizar Redis existente se necessario, sem pedir outro Redis para automacao.
- Uma varredura coordenada por instancia, leitura paginada e progresso persistente.
- Tamanho de pagina NAO e limite de envios. Nao truncar permanentemente os candidatos.
- Teto do CRM, fallback 10, compartilhado pelos dois workers em cada rodada.
- Excedentes continuam pendentes e sao reavaliados antes de um envio futuro.
- Depois de reinicio, reavaliar estado atual; nao disparar backlog cegamente.
- Historico detalhado de execucoes concluidas/ignorados: 90 dias, configuravel por env.
- Limpeza nao apaga recusas, pendencias, auditoria de decisoes nem os registros
  minimos necessarios contra duplicacoes. Politica desses registros e separada.

## 8. Painel e permissoes

- Deve haver painel operacional; aproveitar a pagina Automacao/Follow-up existente
  no CRM, seu login e suas permissoes, sem login paralelo.
- Mostrar enviados, ignorados com motivo, registro CRM pendente, falhas e incertos.
- Permitir recuperar registro comprovado sem reenviar a mensagem.
- Gestor e administrador podem executar acoes sensiveis: resolver envios incertos
  e liberar bloqueios mediante autorizacao registrada.
- Subgestor nao ganha essas acoes sensiveis. Visualizacao segue permissoes existentes,
  inclusive acesso a clientes, sem ampliar visibilidade implicitamente.
- Auditoria de operador, data, justificativa e evidencia nas acoes manuais.
- Contratos das acoes e layout detalhado ainda nao implementados.

## 9. Banco: decisoes e pendencias separadas

Decisao anterior mantida: investigar o banco interno do n8n e copiar SOMENTE A
ESTRUTURA para banco separado e vazio, adaptando-a para a automacao. Nao copiar
credenciais, execucoes ou dados de clientes do banco interno, nem modificar a origem.

- O inventario direto do PostgreSQL instalado ainda NAO aconteceu. A tentativa
  local anterior nao resolveu o host interno `postgres`; nao houve consultas.
- Arquivos/migrations ajudam a investigar, mas nao comprovam a estrutura implantada.
- `follow_ups_temporary` e os registros de recusa sao controles de negocio dos
  fluxos, nao as tabelas internas de execucao do produto n8n.
- CRM ja tem mensagens, regras, configuracoes, reservas, idempotencia e outbox.
  Reutilizar contratos sem duplicar filas com a mesma responsabilidade.
- Copiar schema n8n nao implementa runtime, historico ou retomada em TypeScript.
  Repositorios, adaptacoes e migrations ainda precisam ser escritos e testados.
- Proposta: inventario/schema-only dentro da rede interna, provisionamento inicial
  unico, migrations versionadas com trava e bloqueio do processamento em falha.
  Nao fazer clone/dump em cada startup. Execucao requer autorizacao.
- Proposta para futura producao: preservar recusas e controles de envios existentes
  na transicao; nao iniciar envios reais com deduplicacao e recusas zeradas.
  Essa migracao minima de negocio e diferente do clone vazio do schema n8n.
- Desenho fisico, provisionamento, permissoes, conexoes e estrategia de transicao
  ainda dependem do inventario. Nao apresentar como implementados/aprovados em detalhe.

## 10. Prioridade posterior: n8n de homologacao

Pedido do usuario apos o planejamento: salvar estas decisoes e preparar/importar
os fluxos atuais da Estrutural em um n8n de testes vazio, adaptados para Evolution
e CRM de homologacao. E uma etapa de homologacao, nao abandono do TypeScript.

- CRM: `https://crm-teste.187.77.47.30.sslip.io`.
- Evolution base: `https://evolution-hml.187.77.47.30.sslip.io`.
  `/manager/` e a interface administrativa, nao o prefixo das chamadas API.
- O identificador inicialmente informado como instancia coincide com a chave de API
  no arquivo local. Seu valor foi removido desta documentacao; nao deve ser publicado.
- Numero informado da instancia: `556198897431`; nao presumir que seja o destinatario
  permitido para todos os testes.
- Chave do n8n de testes fornecida em arquivo local `automacao/n8n-teste-api.md`.
  Ler sem expor ou incluir em artefatos/commits.
- `.env.example` local contem valores REAIS do Dokploy e alteracoes do usuario.
  Nao publicar seu conteudo, nao inclui-lo em commit nem sobrescrever suas alteracoes.
- Conferir conflitos entre instancia/numero fornecidos e envs sem divulgar segredos.
- Importacao deve remapear IDs de subfluxos e credenciais e eliminar alvos de producao.
- Nao copiar usuarios, tokens JWT de atendentes, chaves de producao, pinData,
  historicos ou dados de execucoes para os fluxos de homologacao.
- Nao ativar agendamentos, chamar workflows nem enviar mensagens durante preparo.
- Usuario autorizou explicitamente criar todos os fluxos e as credenciais necessarias
  no novo n8n de testes, desativados e sem executar. Excecao delimitada a regra de
  consulta; nenhuma escrita em n8n de producao, ativacao ou deploy da stack.
- Consulta de leitura na Evolution confirmou o numero informado conectado e o nome
  de instancia `instancia_numero_teste`, igual ao nome configurado no arquivo de env.
  Usar esse nome nas rotas, nao presumir que o identificador informado seja o nome.

## 11. Estado da implementacao nesta consolidacao

- Base TypeScript/Fastify, toggles e preparacao Docker/Compose existem localmente.
- Worker, banco funcional, follow-up TypeScript e painel operacional nao estao prontos.
- Este documento foi criado para persistir as decisoes antes das proximas alteracoes.
- Nao foi feito push, deploy, ativacao ou envio como parte desta consolidacao.
- Ao implementar, incluir testes de duplicacao, concorrencia, reinicio, recusa,
  resposta durante avaliacao, falha CRM apos aceite, timeout incerto, limites,
  autorizacao do painel e isolamento entre filhos; documentar resultados reais.
