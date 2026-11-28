# Parametros do atendimento: contrato para homologacao

Fonte da comparacao: exports Estrutural EV-01, EV-05 e EV-16; backend do checkout.
Os exemplos do mockup nao sao configuracao universal dos filhos.

| Controle | Fonte e comportamento |
| --- | --- |
| Nome, instrucoes, tom e tamanho | Painel, no mesmo PostgreSQL da automacao que os seis prompts. Salvar vazio remove a personalizacao. Sem ela vale o prompt cadastrado da instancia. Para reproduzir Estrutural, carregar primeiro os seis textos do EV-01. Nao usar a identidade da Estrutural automaticamente em outro filho. |
| Apresentar-se no primeiro contato | Proposta CRM: ia.comportamento.apresentar_assistente_virtual, BOOLEAN. Acrescenta instrucao apenas no primeiro contato confirmado, nao depois de um reset de memoria. |
| Faixas de preco | Proposta CRM: ia.comportamento.informar_precos_da_base, BOOLEAN. Quando ligada permite apenas faixas explicitas da FAQ ativa. Sem flag permanece a politica do prompt original, sem orcamento. |
| Irritacao: priorizar e avisar | Pendente: identificar evento, operacao real de prioridade e notificacao com destinatario e comprovante. Nao prometer uma acao via prompt. |
| Preferencia de atendente | Chave existente transferencia.por_lista. A lista de candidatos vem do CRM. A escolha, a confirmacao de disponibilidade e a transferencia efetiva precisam de teste de jornada. |
| Sugerir visita tecnica | Pendente: confirmar agenda do filho, permissao e fonte de horarios. Nao inferir horarios nem usar a agenda clinica por padrao. |
| Resumir e completar cadastro | O EV-05 ja consulta ev05.resumo.habilitado e ev05.preenchimentoAutomatico.habilitado (estrutura ev05 no automation-config); preserva gatilho, politica e callback de cada operacao. Nao criar gravacao duplicada no agente de conversa. Confirmar campos editaveis (nome, empresa, endereco) antes de portar o pos-atendimento. |

Valores propostos em parametros[].valor do GET /internal/v1/automation-config:
booleanos como "true"/"false" e inteiros decimais como texto. Nao se presume
que o CRM ja publique as novas chaves. Sem flag nova, nenhuma instrucao extra.

| Avancado | Aplicacao / pendencia |
| --- | --- |
| ia.contexto.mensagens (5-100) | Limita mensagens de historico no turno. Sem override, a origem deve fornecer a janela legada: Postgres Chat Memory do EV-01 usa contextWindowLength=10 (janela de interacoes, nao o 30 do mockup). |
| ia.resposta.atraso_segundos (0-30) | Espera adicional antes do envio. Ausente: sem espera adicional. EV-16 tem buffer de 10 s; nao confundir agrupamento de mensagens com atraso de resposta. |
| ia.resposta.max_sequencia (1-20) | Antes do modelo/envio, comparar com a contagem consecutiva do atendimento. Confirmar fonte atomica no worker e zerar no evento correto, nao contar a partir de historico truncado. Sem chave, nenhum novo limite. |
| ia.resumo.quantidade_mensagens (1-200 no mockup) | Confirmar com CRM se significa janela de leitura. quantidadeMensagens do resumo-ia tambem aparece associado a gatilho; nao substituir gatilho por tamanho de janela. Pendente no executor EV-05 TS. |

Teste de homologacao: comparar sem overrides com EV-01; alterar nome e remover;
testar primeira mensagem vs retorno, FAQ com/sem faixa, historico longo e
sequencia no limite. Validar efeitos pos-atendimento separadamente, inclusive
ambas as flags desligadas. A rota de producao nao foi alterada.
