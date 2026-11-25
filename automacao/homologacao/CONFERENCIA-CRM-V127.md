# Conferencia do repasse de mensagens sistematicas

Data: 24/11/2026. Verificacao de arquivos, nao do banco implantado.
Main consultada: 61b9a8d0 (inclui merge 29c7ba3 da PR 362).
A main foi incorporada localmente em teste/automacao-teste-1, preservando
as alteracoes locais da restricao compartilhada. Sem push ou deploy nesta etapa.

## Resultado do contrato

V127 cadastra as seis chaves esperadas pelo CrmSistematicas, com valor string.
GET /internal/v1/automation-config devolve parametros como lista de chave/valor.
Header: X-Synapse-Token. Nao e JWT de usuario.
ON CONFLICT DO NOTHING preserva valores ja cadastrados; nao redefine preferencias.
false para restricao de horario permite expediente vazio.
Com restricao true e expediente [], nenhum horario e permitido.
Templates vazios sao aceitos na configuracao de Evolution e Z-API.
Para Meta, o executor exige nome, idioma e parametro antes de enviar.
Edicao dos seis parametros no frontend permanece pendente, conforme o repasse.
Nao alteramos o Java nem o frontend do CRM para esta integracao.

## Correcao do item 3 do repasse

AUTOMACAO_SISTEMATICAS_NUMEROS_TESTE e nome antigo.
No codigo local atualizado, usar:

```dotenv
AUTOMACAO_HABILITADA=true
AUTOMACAO_FOLLOWUP_HABILITADO=false
AUTOMACAO_SISTEMATICAS_HABILITADAS=true
AUTOMACAO_RESTRICAO_NUMEROS_HABILITADA=true
AUTOMACAO_NUMEROS_TESTE=SEU_NUMERO_COMPLETO
```

Usar somente digitos internacionais. Adicionar ou editar as envs manualmente
no Dokploy antes de implantar a nova imagem; nao basta trocar o nome no Git.
Lista vazia bloqueia todos; invalida impede iniciar o executor.
Nao usar as variaveis globais WHATSAPP_* para proteger o TypeScript.
Para a primeira implantacao, manter FOLLOWUP e SISTEMATICAS false.
Habilitar somente sistematicas apos conferir bancos e contrato.

## O que ainda precisa ser comprovado na homologacao

- CI da versao integrada e publicacao de imagens (dependem de push autorizado).
- Deploy manual/autorizado com a tag nova; nenhum deploy foi executado aqui.
- V127 no historico Flyway do CRM e seis chaves no GET interno.
- V11 em automacao_infra.migracao no banco tecnico; sao bancos distintos.
- Rodada, reserva, aceite, registro e recebimento real no aparelho.
- Numero fora da lista sem reserva nem chamada ao provedor.

Nao confundir resposta HTTP 200 com presenca das chaves, nem aceite com entrega.
Ainda nao foi verificado acesso a rede privada ou banco da homologacao nesta conferencia.
