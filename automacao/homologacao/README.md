# Estrutural no n8n de homologacao

Preparado e importado em 09/11/2026, com autorizacao explicita do usuario.
Foram copiados os 25 workflows da Estrutural, incluindo as versoes `copy`, e
criado um adaptador compartilhado Evolution. Todos permaneceram desativados.
Nenhum workflow foi executado e nenhuma mensagem foi enviada nesta importacao.
O workflow preexistente/criado pelo usuario `My workflow` nao foi alterado.

## Links

- n8n: <https://n8n-teste.187.77.47.30.sslip.io>
- Entrada: <https://n8n-teste.187.77.47.30.sslip.io/workflow/Q4LshQqfcloscgEV>
- Follow-up: <https://n8n-teste.187.77.47.30.sslip.io/workflow/IUSgbDjPRPIJPIP2>
- Adaptador Evolution: <https://n8n-teste.187.77.47.30.sslip.io/workflow/j9vBXDJ8Xn91uGmp>
- Inventario completo, IDs e pendencias especificas: [manifesto.json](manifesto.json).
- Decisoes TypeScript: [DECISOES-FOLLOWUP-UNIFICADO.md](../DECISOES-FOLLOWUP-UNIFICADO.md).

## O que foi adaptado

- Referencias entre subfluxos remapeadas para IDs do novo n8n.
- Credencial `OpenAI account` ja existente no destino reaproveitada.
- Credenciais novas de homologacao para CRM interno, Evolution, PostgreSQL,
  Redis, autenticacao de webhooks e API do n8n. Segredos nao ficam nos JSONs.
- URL publica CRM: `https://crm-teste.187.77.47.30.sslip.io`.
- Rotas `/internal/v1` usam `http://synapse-backend-internal:8080`, alias da
  rede privada da stack. O Compose ja fornece esse endereco para o n8n.
  Consulta externa das mesmas rotas pelo dominio publico retornou 404.
  O acesso pela rede privada ainda precisa ser validado em execucao autorizada.
- Evolution: `https://evolution-hml.187.77.47.30.sslip.io` e instancia
  `instancia_numero_teste`, confirmada em consulta de leitura como conectada
  ao numero informado. O valor inicialmente chamado de instancia era uma chave
  de API e nao deve ser usado em URL nem publicado.
- Entrada Evolution traduzida para o contrato interno legado: texto, resposta
  de botao/lista, audio, imagem e documento. Grupos, mensagens proprias e LID
  sem telefone resolvido sao ignorados.
- Webhook principal protegido por Header Auth `X-Synapse-Webhook-Token`.
  O CRM deve repassar esse token e o corpo Evolution. Nao configurar o provedor
  diretamente para este endpoint sem o mecanismo de autenticacao correspondente.
- Saida de texto, botoes e listas traduzida para rotas Evolution. Identificador
  retornado e apresentado no contrato que os nodes de registro ja utilizam.
- Presenca traduzida para Evolution; nao representa comprovante de leitura.
- Obter midia via Evolution e converter Base64 para arquivo binario; fotos de
  contato usam a rota Evolution, sem chamadas a Meta/UZAPI.
- Prefixos Redis/sessao separados para homologacao.
- pinData, staticData, JWTs antigos e credenciais da origem nao foram copiados.

Os nomes de nodes legados foram preservados em varios pontos porque outros nodes
os referenciam por nome. Um nome contendo Meta/UZAPI nao identifica necessariamente
o destino atual: consultar os parametros e o adaptador compartilhado.

## Protecoes e pendencias antes de executar

1. Todos os workflows estao desativados. Isso NAO impede execucao manual ou por
   subworkflow. Nao executar manualmente antes de revisar as dependencias.
2. O node `Configuracao HML` do adaptador tem `envios_habilitados=false` e lista
   de destinatarios copiada da configuracao de homologacao. O numero conectado
   e remetente, nao uma autorizacao para enviar a qualquer destinatario.
3. Falta preencher `HML Login CRM - PREENCHER` com usuario tecnico de teste.
   `HML CRM JWT - PENDENTE LOGIN` nao e um JWT valido; nao foi reaproveitado token
   de usuario de producao. Renovacao existe, mas nao foi executada.
4. PostgreSQL/Redis apontam para a rede privada do CRM de teste. Nenhuma conexao
   SQL, criacao de tabelas ou copia de dados foi executada. Faltam validar tabelas
   tecnicas, FAQ, memoria, permissoes e dados de teste. O banco tecnico configurado
   nesta copia e o banco N8N_DB_NAME fornecido, nao um banco TypeScript novo.
5. Repasse do CRM, URLs dos webhooks e tokens de entrada precisam ser configurados
   no deploy quando autorizado. Os campos de repasse estavam vazios/desligados nas
   envs fornecidas. Nenhuma env do Dokploy foi alterada.
6. EV-17 depende de JEV. Como nao ha endereco/credencial de homologacao fornecidos,
   suas chamadas foram substituidas por erro explicito, nao direcionadas a producao.
7. EV-07 depende de templates Meta. Nao converter template aprovado em texto
   arbitrario: nodes de envio ficam bloqueados com motivo explicito ate definir
   o conteudo equivalente para Evolution. O fluxo foi importado, nao omitido.
8. Configurar IDs de lead/atendente e telefone de teste que eram especificos da
   origem. Esses valores nao foram presumidos como existentes no CRM novo.
9. A confirmacao real de botoes/listas, download de midia e registro no CRM depende
   de testes autorizados. Importacao e testes de transformacao nao provam entrega.

## Relacao com o planejamento TypeScript

Esta e uma COPIA ADAPTADA dos fluxos atuais para homologacao, nao a implementacao
do follow-up TypeScript planejado. Mantem regras/agendamentos da origem salvo
adaptacoes de integracao e protecoes documentadas. Nao afirmar que limite de
envios pelo CRM, painel novo, retencao de 90 dias ou novas garantias de retomada
ja estejam implementados nesta copia n8n.

## Validacao e ferramentas

`node --test automacao/homologacao/adapters.test.mjs` valida os adaptadores com
eventos sinteticos, sintaxe JS e estrutura dos exports, sem chamadas externas.

Na importacao, 15 testes locais passaram. Consulta remota confirmou 26 workflows
gerenciados desativados, sem referencias quebradas de subfluxos/credenciais e sem
execucoes no destino. O workflow adicional do usuario foi preservado. Os arquivos
gerados foram verificados contra os segredos locais, sem correspondencias.
Essas verificacoes nao substituem o teste funcional com o CRM e o WhatsApp.

`importar-estrutural.mjs prepare` le origem/destino e gera os JSONs locais.
`importar-estrutural.mjs import` cria/atualiza SOMENTE workflows desativados
gerenciados pelo manifesto no host de testes, com nova autorizacao quando aplicavel.
Nenhum dos modos ativa ou executa workflows. A origem aceita apenas GET no script.
Nao repetir importacao sobre edicoes manuais sem comparar os arquivos antes.

Os JSONs sao gerados por parser a partir dos exports, e os templates JS editaveis
estao em `templates/`. URLs/configuracoes nao secretas refletem a fotografia das
envs fornecidas no preparo; nao sao sincronizadas automaticamente com o Dokploy.
Chaves sao lidas de arquivos locais apenas para criar credenciais criptografadas
no n8n. `.import-state.json` e `../n8n-teste-api.md` ficam fora do Git.
O `.env.example` original contem segredos reais: NAO incluir sua alteracao no commit.

Na importacao nao houve deploy da stack, ativacao de fluxos ou alteracao do n8n de origem.
Em pedido posterior, o usuario autorizou publicar esta versao em
`feat/automacao-local-base`, inclusive o possivel deploy automatico da homologacao
pelo Dokploy. Isso nao autoriza ativar os workflows nem publicar segredos locais.
