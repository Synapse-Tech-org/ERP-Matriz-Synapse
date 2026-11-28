# Conversa TypeScript: plano de migracao

Referencia de desenho: definicoes publicadas consultadas em 25/11/2026 (GET).
Nao sao snapshots de payloads, prompts ou credenciais. Um no presente no grafo
nao prova que o caminho foi percorrido em producao.

## Escopo

- Manter um export de trabalho do EV-01, nao duplicar os JSONs publicados.
- Usar o seletor de CONVERSA.md: AGENTE_IA primeiro; CHATBOT_DETERMINISTICO
  separado e sem responder enquanto nao estiver implementado. Nunca fazer
  fallback de chatbot para IA. Manter o chatbot em n8n durante essa fase.
- Nao portar a rota de teste do EV-00, os destinos copy nem o filtro local de
  numero da Femina. Testar no filho de homologacao com publico TS restrito.

## Referencias funcionais

Estrutural: EV-00 FNCKnkLKsvU2qMKL (entrada); EV-01 ifYNV5emHaYerNHC
(agente); EV-16 9X5hZh0dr34H5vDl (buffer); EV-13 nksMZg1fZma1w3A5 (midia);
EV-08 tKAG5YpkDxzb2gPn (avaliacao); EV-14 coJzT7iKvN6AIol5 (foto);
EV-03 nglTw6N8vO6Pddr7 (transferencia); EV-12 4ZCtNxasGfd6O1uG (atendimento).
EV-01 consulta a FAQ no Postgres. Nao presumir chamada ao EV-02.

Femina: entrada cDvBa01PsPYIkJmm; JWT aCKJVhA9LzHDQOTF; modulo principal
E6bnCcnLmAF8PMTg; envio z30aPm8PjyNOpKRs; confirmar gDoiHzuSf8JcE4YY;
cancelar g3wWQ9hfYHC56SnJ; handoff muepVEluvNPJPbhd.
O modulo tambem referencia listar horarios WqzKZ5ovkeTmfOLv, criar
uLlW0F5gEIiN8mcB, atualizar Ogej3trWyNZMrDzx e pos-agendamento
pKUOvhIAcmv2V2YH. Uso real e alcance desses ramos ainda nao verificados.

## Sequencia proposta

1. Fixar o contrato de entrada do CRM com amostras anonimizadas da HML:
   texto, resposta interativa e midia. Validar autenticidade, direcao,
   destinatario permitido e ID estavel antes de qualquer efeito.
2. Compartilhar somente o que tiver o mesmo contrato: deduplicacao, consulta
   de atendimento, envio por provedor, registro de aceite e diagnostico no
   painel. Nao aplicar buffer de texto do agente a cliques de menu por padrao.
3. No agente, preservar ordem e desvios do legado: avaliacao pendente,
   recusa de follow-up, midia e buffer; resolver atendimento e nao responder
   sobre atendimento humano; equipe, disponibilidade, memoria, FAQ, triagem,
   comandos, transferencia e foto. Delimitar cada efeito antes de implementa-lo.
4. Separar configuracao de infraestrutura/segredos (env) das regras editaveis
   (CRM). Inventariar chaves existentes, tipos e defaults antes de pedir novos
   campos; centralizar defaults de negocio e registrar quando utilizados.
   Sem regras locais que substituam permissoes ou credenciais ausentes.
5. Testar equivalencia em HML: mensagem normal, repetida, rajada, midia,
   atendimento humano, recusa, avaliacao, reset, sair e transferencia.
   Verificar o efeito real no CRM e no aparelho, sem dois consumidores.
6. Depois implementar o tratador deterministico pelo mesmo contrato de entrada,
   com estado e botoes proprios. Nao acoplar a escolha ao tenant ou ao provedor.

## Entrada confirmada (25/11/2026)

O CRM e o unico remetente para o TypeScript. Nao cadastrar webhooks dos
provedores apontando diretamente para a automacao. Isso nao uniformiza o JSON:
RepasseWebhookAutomacaoHttpAdapter envia repasse.payloadCru(), com ID de evento,
tentativa e X-Synapse-Webhook-Token quando configurado. O tradutor Meta pode
filtrar o lote; Z-API e Evolution podem repassar o payload do canal sem
assinatura Meta. Validar a autenticidade do repasse do CRM na entrada.

Desenho: um adaptador de entrada por formato, atras de uma interface comum.
Normalizar texto, midia, botao/lista (preservar ID e rotulo), identificadores
e direcao antes do roteamento. Lotes podem conter mais de uma mensagem;
status, ecos e formatos nao reconhecidos nao devem disparar resposta da IA.
O provedor configurado na instancia orienta a leitura; AUTOMACAO_CONVERSA_MODO
escolhe o tratador. Nao inferir um a partir do outro.

Mapa de referencia: Estrutural = Meta oficial; HML = Evolution, inicialmente
AGENTE_IA; Femina = Z-API segundo a ultima configuracao informada. UZAPI e um
formato legado distinto: confirmar o provedor efetivo e se ha coexistencia
antes de portar a entrada da Femina; nao tratar os dois nomes como sinonimos.

## Decisoes abertas

Estado local em 26/11: adaptadores de leitura Evolution, Meta e Z-API e
roteamento sem efeitos externos. Isto nao porta os EV-00/01: faltam entrada
autenticada e duravel, deduplicacao, resolucao de cliques e pendencias,
buffer, interpretacao de midias, contexto de atendimento, memoria, FAQ,
modelo, ferramentas, comandos, transferencia e registro do envio. EV-14
(foto) e a fase deterministica Femina tambem nao foram migrados.
Testes de contrato com dados sinteticos nao sao homologacao ponta a ponta.

- Validar o contrato de cada adaptador com amostras anonimizadas do repasse
  real (texto, midia, clique e status); nao presumir HMAC Meta para todos.
- Definir se a primeira homologacao deve incluir todos os desvios do EV-00/01
  ou comecar com texto, memoria, reset e transferencia em atendimento de teste.
- Antes da fase Femina, conferir execucoes dos ramos de agenda e alcancabilidade,
  sem provocar agendamentos reais.
