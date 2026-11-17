# Publicacao de teste da automacao - 17/11/2026

Branch: `teste/automacao-teste-1`.
Base: main `d7e47da736400125408d5da8402f88d1e6b5276a`.

O operador autorizou criar/publicar esta branch, nao fazer deploy nem merge na
main. A copia de trabalho original permanece preservada, incluindo envs locais.

## Escopo

- Uma classe por provedor (Meta, Z-API, Evolution), com validacao compartilhada.
- Diagnostico por atendimento/fase, causas HTTP conhecidas e comprovantes no painel.
- Numero fora da lista vira exclusao esperada, nao erro generico de processamento.
- Contexto do incidente da Estrutural e testes de regressao.
- Sem alteracoes no backend/frontend CRM, Compose, credenciais, envs ou fluxos n8n.
- Sem nova migration nem dependencias de producao.

IMPORTANTE: publico independente do follow-up ainda e pendente. A flag global
WHATSAPP_RESTRICAO_NUMEROS_HABILITADA ainda e compartilhada com o CRM.
Nao considerar esta branch autorizacao para reativar o follow-up na Estrutural.
Nao reenviar mensagens antigas nem apagar comprovantes para testar.

## GitHub e Dokploy

1. O CI existente reconhece `teste/` e publica imagens de branch com prefixo
   `br-`, somente depois dos testes exigidos. Nao publica `latest` por este push.
2. Aguardar os TRES jobs de imagem (backend, frontend, automacao) terminarem com
   sucesso. Copiar a tag exata dos logs; nao presumir disponibilidade pelo SHA.
3. Somente no projeto de homologacao: mudar Provider/Branch para
   `teste/automacao-teste-1`. Compose Path continua `docker/dokploy-stack.yml`.
4. Na homologacao, usar SYNAPSE_IMAGE_TAG com a tag `br-` publicada. Conferir
   AUTOMACAO_IMAGE_REPOSITORIO e remover digest antigo apenas mediante decisao
   do operador; um digest fixado pode manter a automacao anterior apesar da tag.
5. Preservar banco, volumes, URLs e segredos especificos da homologacao.
   Manter follow-up desligado ate revisar publico do teste e autorizar disparos.
6. Deploy e realizado apenas com confirmacao explicita. Publicar branch/imagem
   nao faz deploy nem muda a branch configurada no Dokploy automaticamente.

Nao e necessario PR para implantar uma branch de teste diretamente. Um PR para
main deve ocorrer apenas depois da validacao e autorizacao separadas.

## Validacao visual opcional

`node automacao/test/painel-diagnostico.mjs` usa fixtures GET locais, sem CRM ou
WhatsApp reais. Requer o build da automacao e Playwright instalado no frontend
do monorepo. PLAYWRIGHT_CHANNEL=chrome permite usar Chrome ja instalado.
`--preview` mantem uma previa local com dados ficticios para inspecao.
