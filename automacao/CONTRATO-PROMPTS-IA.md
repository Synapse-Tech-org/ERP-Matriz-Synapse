# Configuracao de conversa

Prompts do modelo: GET /painel/api/prompts lista os seis campos de "Prompts do atendimento":
prompt_global (global), prompt_router (router), prompt_triagem_transferencia (triagem),
prompt_institucional (institucional), contexto e contexto_institucional.
As chaves tem prefixo conversa.ia.prompt. PUT /painel/api/prompts/{chave} recebe
{"valor":"texto"} e exige sessao de administrador. A migration tecnica V12
cria automacao_infra.prompt_conversa no banco da automacao de cada instancia.
Sem seed nem SQL no CRM. Preencher os textos revisados do n8n antes de ativar.
Uma mensagem usa uma unica leitura. Prompt em branco ou ausente bloqueia o modelo.
O router deve retornar DUVIDA_INSTITUCIONAL ou TRIAGEM_OU_TRANSFERENCIA.
O contexto institucional aceita {{faq}}. O contexto de triagem aceita {{triagem}},
{{instrucao_operacional_transferencia}}, {{data_hora_atual}}, {{faq_horario}},
{{atendente_escolhido}}, {{equipe}} e {{faq}}. Os valores sao dados do turno,
nao texto fixo no cadastro. Expressoes JavaScript de n8n precisam ser traduzidas.

Contratos confirmados no backend local: GET /internal/v1/atendentes/disponiveis
retorna [{usuarioId,nome,email}] em ordem recomendada. GET /internal/v1/automation-config
retorna parametros[].chave/valor; transferencia.por_lista usa "true" ou "false".
Confirmar com Marcondes se a lista ja aplica rotinas por dia e fuso, inclusive
dia sem atendentes. Lista vazia nao autoriza escolher usuarios do cadastro geral.
Para FAQ, confirmar endpoint, autenticacao, paginacao e formato. Proposta:
itens com categoria, pergunta, resposta e ativo; somente ativos entram no contexto.
Ainda nao ha adaptador de FAQ apontando para um endpoint confirmado.

Mensagens de sistema: textos destinados ao cliente, nao instrucoes do modelo.
O cadastro e do CRM e nao deve ser duplicado na V12. Consultar pelo evento,
respeitar a ativacao e substituir apenas os marcadores cadastrados. Na avaliacao,
preservar tambem o atraso e o formato escolhido. O contrato concreto de leitura
do cadastro mostrado nas telas ainda precisa ser identificado no CRM implantado.
