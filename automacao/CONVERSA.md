# Modo de conversa por filho

No Dokploy, em Environment do servico CRM do filho, configure uma unica chave.
Para homologacao: `AUTOMACAO_CONVERSA_MODO=AGENTE_IA`. Para um filho com menu:
`AUTOMACAO_CONVERSA_MODO=CHATBOT_DETERMINISTICO`. Valor ausente ou vazio nao
seleciona nenhum tratador. Outro texto e erro de configuracao na inicializacao.

O Compose repassa a chave somente ao servico TypeScript. A chave geral
`AUTOMACAO_HABILITADA=false` impede a selecao mesmo com modo definido.
O CRM nao precisa retornar esse dado. A escolha independe de Meta, Z-API ou
Evolution e nao muda as regras de follow-up ou mensagens sistematicas.

Esta etapa prepara o seletor; nao instala um consumidor de webhook nem
substitui os fluxos do n8n. Configurar o modo nao inicia conversas.
