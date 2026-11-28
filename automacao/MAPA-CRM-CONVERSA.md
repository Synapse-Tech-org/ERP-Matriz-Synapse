# Contratos de conversa - consulta de 28/11/2026

Main eafb1110; homologacao codex/frontend-automacao-hml dbdfd4ad.
Comparacao inclui os refs recentes de permissoes-clientes-chat-interno,
albuns-fotos-atendimentos, abrir-atendimento-telefone-ocupado e status-operacional-equipe.
Evidencia de repositorio, nao inventario do banco implantado.

| Origem CRM | Uso pretendido |
| --- | --- |
| configuracao_automacao (V7, chave transferencia.por_lista na V49) | Ler parametros pelo GET /internal/v1/automation-config; ainda confirmar chaves novas do mockup. |
| usuario + disponibilidade_atendente_ia (V2) | GET /internal/v1/atendentes/disponiveis retorna usuarioId, nome e email; nao mandar email ao modelo. |
| rotina_disponibilidade + rotina_disponibilidade_atendente (V2) | Dia da semana, tipo, ativo e vinculacao aos atendentes. Confirmar onde a rotina vigente e aplicada: o SELECT de elegiveis nao faz JOIN dessas duas tabelas. |
| horario_trabalho (V2) | Janelas por dia e papel/IA; confirmar excecoes/feriados e fuso antes de aplicar. |
| configuracao_resumo_ia | EV-05 separado, fora desta migracao do atendimento; nao iniciar nem gravar resumo. |

FAQ: consultar public.faq no PostgreSQL do CRM do filho ate existir API.
A tabela homonima no banco tecnico nao e fonte nem fallback do agente.
Para mensagens de sistema, nao confundir mensagem_rapida, mensagem_festiva,
mensagem de historico ou idempotencia com cadastro por evento. Solicitar ao CRM
rota, autenticacao e exemplo de registros ativos/inativos para ambos os cadastros.

## Infraestrutura
Redis do filho fica na rede interna. Buffer com prefixo proprio e escopo por
instancia e atendimento; nao substitui fila duravel de execucoes nem deduplicacao
de efeitos. Conectar apenas no executor de conversa. OPENAI_API_KEY e segredo
do servico automacao, nao do painel. Nao enviar por chat ou versionar valor.
EV-13 usa extractFromFile com operation=pdf: extracao textual, nao OCR.
Na imagem da automacao usar pdftotext, com limites de entrada, saida e tempo.

V13 registra seis chaves de prompt sem texto (NULL). Preencher via painel;
nao copiar prompt entre filhos. O ingresso deve autenticar o repasse do CRM,
identificar tenant, deduplicar o evento, aplicar publico de testes e so entao
chamar o executor do modo configurado; criar prompts nao ativa esse ingresso.
