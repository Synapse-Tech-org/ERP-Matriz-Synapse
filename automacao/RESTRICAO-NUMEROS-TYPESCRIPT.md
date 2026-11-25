# Restricao de numeros das automacoes TypeScript

Configuracao compartilhada pelo follow-up e pelas mensagens sistematicas.
Nao altera a entrada de webhooks, a IA ou o envio normal do CRM.

Na aba Environment do Dokploy da instancia escolhida, adicionar ou editar:
```dotenv
AUTOMACAO_RESTRICAO_NUMEROS_HABILITADA=true
AUTOMACAO_NUMEROS_TESTE=SEU_NUMERO_COMPLETO
```

Substituir o marcador pelo numero com pais e DDD, somente digitos.
Separar varios numeros por virgula. Comparacao exata, sem sufixo e sem
redirecionar mensagens de outros leads para o numero de teste.

- Flag ausente: true. Lista vazia: nenhum envio permitido.
- Flag ou numero invalido: executor nao inicia; nenhuma liberacao parcial.
- Flag false: ambos os modulos podem enviar a todos os candidatos elegiveis.
- A restricao nao liga os executores: os toggles de cada modulo continuam valendo.
- As variaveis globais WHATSAPP_RESTRICAO_NUMEROS_HABILITADA e
  WHATSAPP_NUMEROS_PERMITIDOS nao sao lidas por estes executores.
- AUTOMACAO_SISTEMATICAS_NUMEROS_TESTE foi substituida. Copiar seu valor
  para AUTOMACAO_NUMEROS_TESTE antes de atualizar a imagem. Nao ha fallback.

O Compose repassa a configuracao ao Node; valores reais ficam somente no Dokploy.
Aplicar novas envs requer deploy autorizado. Este ajuste nao executa deploy.
Novos modulos devem importar compartilhado/restricao-numeros.ts.
