# Repasse para Marcondes: CRM, automação TypeScript e Dokploy

Conferência local de 22/11/2026, branch `teste/automacao-teste-1`, incluindo mudanças ainda não publicadas. Não é inventário das envs de produção. Escopo: follow-up e primeiro bloco de mensagens sistemáticas (aniversário, festivas e fidelização/reativação). Não inclui Darwin nem as confirmações de agenda.

## 1. Quem faz o quê

| Responsável | O que fica ali |
| --- | --- |
| Cliente no CRM | Edita mensagens, prazos, regras ativas e preferências de negócio. Salvar não dispara WhatsApp. |
| CRM (Marcondes) | Persiste essas escolhas no banco do CRM e as devolve nas APIs abaixo. Decide se a automação pode reservar o envio para o lead e registra a mensagem no atendimento. |
| Automação (nós) | Inicia a rodada, consulta o CRM, seleciona candidatos, valida o número de teste, reserva, chama o provedor e registra o resultado. Não depende de webhook de entrada para iniciar. |
| Banco técnico da automação | Rodadas, tentativas e comprovantes. Pode guardar cópia do texto efetivamente enviado, nunca o cadastro editável que substitui a Data Table. |
| Infra da instância | Imagem, acesso aos bancos, credenciais do provedor e controles de ativação/teste. Nenhum token ou telefone real deve entrar no Git. |

## 2. Dokploy: valor na tela, referência no Git

No serviço Compose da **instância de teste** (ex.: homologação → crm-teste → Environment), as duas entradas novas são **da automação sistemática**, não do follow-up nem dos webhooks do CRM:

| Nome | Valor inicial seguro | Ao homologar |
| --- | --- | --- |
| `AUTOMACAO_SISTEMATICAS_HABILITADAS` | `false` | `true` somente na instância escolhida, junto da chave geral já existente `AUTOMACAO_HABILITADA=true`. Não é necessário ligar o follow-up. |
| `AUTOMACAO_SISTEMATICAS_NUMEROS_TESTE` | vazio enquanto desligada | Um ou mais números internacionais completos, com país e DDD, só dígitos, separados por vírgula. É uma lista de destinatários permitidos; não redireciona mensagens de outras pessoas. |

Com o módulo ligado, lista vazia ou inválida impede o início do executor. A versão analisada não tem modo irrestrito. Não mudar `WHATSAPP_RESTRICAO_NUMEROS_HABILITADA`: é outra proteção e afeta o CRM. A lista nova **não protege retroativamente o follow-up existente**. Para testar só sistemáticas, manter o follow-up desligado na homologação.

O Provider usa `docker/dokploy-stack.yml`, não `automacao/compose.yml`. O primeiro lista explicitamente as envs do serviço. Escrever apenas na aba Environment dá um valor para o Dokploy substituir, mas não acrescenta a variável à lista que o processo Node recebe. A proposta no Git é referenciar, não preencher:

```yaml
# Dentro do environment já existente de services.automacao
AUTOMACAO_SISTEMATICAS_HABILITADAS: ${AUTOMACAO_SISTEMATICAS_HABILITADAS:-false}
AUTOMACAO_SISTEMATICAS_NUMEROS_TESTE: ${AUTOMACAO_SISTEMATICAS_NUMEROS_TESTE:-}
```

Não são duas novas senhas. A primeira é uma chave liga/desliga; a segunda é uma lista operacional privada. Token interno, senhas e chaves de WhatsApp continuam no mecanismo existente por instância. Não colocar valores literais no YAML, nem trocar tag, rede, porta ou credenciais para fazer esse repasse. Salvar em Environment não altera um processo já em execução; a aplicação da configuração exige um deploy autorizado, com imagem contendo o executor.

**Segunda razão para o YAML:** `services.automacao-banco.configs` monta individualmente os arquivos SQL. Esta branch já declara a config que aponta para `../automacao/banco/migrations/V11__mensagens_sistematicas.sql` e a monta em `/opt/automacao/migrations/V11__mensagens_sistematicas.sql`, seguindo V10. A própria aplicação também aplica as migrações empacotadas no início; não é que o PostgreSQL exija YAML para criar tabelas. É para o provisionador da Stack e a imagem reconhecerem **a mesma versão**, como exige o teste da Stack. A V11 não cria tabelas. Identifica o fluxo e os resultados em `automacao_infra.followup_rodada` e amplia os comprovantes de `public.ev07_envios_automaticos`, preservando a chave única da V7 e os IDs antigos do painel. Não altera tabelas de clientes ou o banco do n8n.

## 3. Contrato que já existe no CRM

A automação **busca** os dados a cada rodada. Base: `AUTOMACAO_CRM_URL`, por padrão o backend na rede interna. Prefixo das rotas desta seção: `/internal/v1`. Header: `X-Synapse-Token` com o valor de `SYNAPSE_TOKEN_INTERNO`. Não publicar rotas internas na internet nem entregar esse token ao navegador.

| Método e caminho após o prefixo | O que a automação consome |
| --- | --- |
| GET /automation-config | Objeto com `parametros: [{chave, valor, ...}]`. O follow-up também exige `exigeTemplateForaDaJanela` booleano. |
| GET /regras/follow-up | Lista de regras ativas: `id, nome, tempoMinutos, texto`. |
| GET /regras/fidelizacao | Lista de regras ativas: `id, diasSemContato, mensagem`. Dias é inteiro positivo, não texto. Na Femina, cadastrar aqui a regra de 90 dias com a mensagem hoje na Data Table. |
| GET /mensagens-festivas/hoje | Lista das datas festivas ativas do dia. O executor usa `id, mensagem`; não inventa destinatários a partir da data. |
| GET /fidelizacao/aniversariantes-hoje | Objeto com `habilitado` booleano, `mensagem` e `leads: [{id,nome,telefone}]`. O executor cruza os IDs com a seleção autorizada. |
| POST /leads/{leadId}/envios-proativos/reservas | Antes do WhatsApp, recebe `tipo, regraId, ocorrencia, chave, execucaoId`. Só segue com `podeEnviar: true`. Tipos: FOLLOW_UP, ANIVERSARIO, FESTIVA, FIDELIZACAO. O teto e intervalo do CRM continuam valendo. |
| POST /atendimentos/{id}/mensagens-enviadas | Depois do aceite, recebe `wamid, chaveDeEnvio, tipo, conteudo`; devolve `mensagemId`. Follow-up envia BOTOES com opções e origem. Sistemáticas registra TEXTO renderizado, inclusive quando o transporte Meta é template. Aceite não é entrega no celular. Falha só no registro não pede novo WhatsApp. |
| POST /atendimentos/{id}/finalizar | Só no caminho de encerramento do follow-up; usa header Idempotency-Key. Sistemáticas não finaliza nem cria atendimento. |

**Não vem tudo por API.** No follow-up, o TypeScript lê atendimento, lead e histórico de mensagens pelas tabelas do CRM. Nas sistemáticas, lê `public.lead` (id, nome, telefone, criação, última interação e última mensagem do lead) e o atendimento mais recente em `public.atendimento` (id e status). É consulta paginada de leitura com contexto de serviço. Sem atendimento para registrar, não envia. Não pedir ao Marcondes um webhook nem um endpoint novo de leads para este bloco.

**Cadastros existentes:** sob `/api/v1/automacao` já existem as rotas administrativas `/follow-ups`, `/fidelizacao`, `/fidelizacao/configuracao` e `/fidelizacao/datas-festivas`. A configuração específica de fidelização admite hoje as chaves de aniversário `fidelizacao.aniversario.habilitado` e `fidelizacao.aniversario.mensagem`; não pressupor que o PUT dessa tela aceite uma chave nova apenas por ela existir no TypeScript.

## 4. Entradas que a automação espera ler

Para conferir com Marcondes: comparar as chaves, tipos e valores abaixo com uma resposta anonimizada do GET interno da homologação. Não é pedido de tela, tabela ou endpoint novo. Se o CRM já expõe o dado com outro nome, alinhar o consumidor antes do teste. As seis chaves abaixo são **contrato novo do consumidor**, não controles que já entregamos no CRM.

| Chave exata | Significado de `valor` (string no DTO) | Se não vier |
| --- | --- | --- |
| `fidelizacao.excluir_finalizados` | Checkbox “Excluir atendimentos finalizados da fidelização”. Texto `true` ou `false`. Não se aplica a aniversário ou festiva. | `true` |
| `sistematicas.somente_horario_comercial` | Checkbox “Enviar mensagens sistemáticas apenas no expediente”. Mesmo formato. | `false`: qualquer hora/dia. |
| `sistematicas.expediente` | Intervalos semanais, no fuso da instância. O campo `valor` é **texto que contém JSON**, não um array solto. Domingo = 0; sábado = 6. HH:mm, início inclusivo, fim exclusivo, início < fim. Permitir mais de um intervalo por dia. | Ignorado se a restrição estiver desligada; se ligada, sem intervalo válido não há envio. |
| `sistematicas.meta.template_nome` | Nome do template aprovado da conta daquele filho. Usar catálogo existente se houver; não criar outra conta/credencial. | Em Meta, não envia. |
| `sistematicas.meta.template_idioma` | Código de idioma aprovado, por exemplo `pt_BR`. | Em Meta, não envia. |
| `sistematicas.meta.parametro_texto` | Nome do parâmetro do corpo que recebe o texto renderizado. O original da Estrutural usa template `interno_aniversario`, parâmetro `texto`. | Em Meta, não envia. |

Exemplo **parcial** da resposta de GET /internal/v1/automation-config (segunda-feira, 09h às 18h; demais dias sem expediente neste exemplo):

```json
{
  "exigeTemplateForaDaJanela": true,
  "parametros": [
    {"chave":"fidelizacao.excluir_finalizados","valor":"true"},
    {"chave":"sistematicas.somente_horario_comercial","valor":"true"},
    {"chave":"sistematicas.expediente","valor":"[{\"dia\":1,\"inicio\":\"09:00\",\"fim\":\"18:00\"}]"},
    {"chave":"sistematicas.meta.template_nome","valor":"interno_aniversario"},
    {"chave":"sistematicas.meta.template_idioma","valor":"pt_BR"},
    {"chave":"sistematicas.meta.parametro_texto","valor":"texto"}
  ]
}
```

Meta usa esses três parâmetros para todas as categorias do EV-07. Z-API e Evolution enviam texto e não precisam deles. O dia é calculado no fuso da instância; não copiar um fuso da Femina para todos os filhos.

**Comportamento das faixas:** prazo medido por última interação no CRM (se nula, criação). O envio registrado também conta como interação e reinicia o prazo. A faixa já usada não é liberada de novo apenas porque a automação enviou; o ciclo de proteção usa a última entrada do cliente ou a criação. Se o cliente já chega com 90 dias e há regras de 30, 60 e 90, escolhe a de 90, não dispara três juntas. Aniversário é uma vez por lead/ano; festiva, uma vez por lead/mensagem/dia.

## 5. Follow-up: parâmetros de que faltava o repasse

No mesmo `parametros[]`, o consumidor já reconhece estas chaves. São opcionais, não sete envs novas nem sete novos endpoints. Não encontrei essas chaves exatas cadastradas no backend/frontend do checkout consultado; dados que alguém cadastrou diretamente numa instância não são verificáveis pelo Git. Se o objetivo for edição pelo cliente, conferir cadastro, lista de chaves permitidas e controles antes de declarar que a tela já suporta cada uma.

| Chave | Padrão no consumidor |
| --- | --- |
| `followup.limite_envios_por_rodada` | 10 envios |
| `followup.encerrar_pos_followup_minutos` | 30 minutos |
| `followup.janela_texto_livre_minutos` | 1430 minutos (também teto do consumidor) |
| `followup.botao_sim_id`, `followup.botao_nao_id` | `ev06_followup_sim`, `ev06_followup_nao`; overrides técnicos por env dos IDs têm precedência. Preservar os IDs que o tratador de respostas do filho reconhece. |
| `followup.botao_sim_titulo`, `followup.botao_nao_titulo` | `Sim`, `Nao` |

O texto da mensagem e o prazo de cada regra vêm de /regras/follow-up, não destes padrões. Falha ao consultar o CRM não equivale a resposta válida com parâmetro ausente. O tratamento da resposta do cliente continua no fluxo existente, fora deste executor.

## 6. Aceite combinado, antes de produção

1. CRM: editar uma regra pelo cadastro existente e conferir, com acesso interno de serviço, que id, prazo e mensagem mudaram no GET correspondente. Fazer o mesmo para as duas caixas de seleção e o expediente no GET de configuração. Sem redeploy por edição.
2. Infra: conferir na prévia da Stack as duas referências apenas em automacao, a V11 em automacao-banco e o módulo desligado por padrão. Não usar valores reais em tickets/prints.
3. Homologação: ligar somente após aprovação. Usar número autorizado e outro não autorizado; o segundo não pode gerar reserva nem chamada ao provedor. Testar finalizado com checkbox nos dois estados e envio fora do expediente.
4. Automação: comparar rodada, comprovante, registro no CRM e recebimento no aparelho. Se o CRM falhar depois do aceite, recuperar só o registro. Não reenviar para descobrir se chegou.
5. Antes da virada: conciliar histórico do n8n, evitar dois agendadores para o mesmo público e decidir separadamente a liberação de produção. Esta versão só opera com lista de teste.

Referências no repositório: [Stack principal](../docker/dokploy-stack.yml), [Compose separado](compose.yml), [V11](banco/migrations/V11__mensagens_sistematicas.sql), [cliente CRM do follow-up](src/followup/crm-http.ts), [padrões do follow-up](src/followup/padroes.ts), [cliente CRM das sistemáticas](src/sistematicas/crm.ts), [regras](src/sistematicas/regras.ts), [rodada](src/sistematicas/rodada.ts).
