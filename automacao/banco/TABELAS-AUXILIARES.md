# Tabelas auxiliares da automacao

Implementacao local de 10/11/2026, baseada no inventario dos SQL e dos nodes
atuais da Estrutural. Nao e uma copia de registros ou um dump do banco de producao.

## Migrations

Pasta: `automacao/banco/migrations/`. V1 e V2 permanecem inalteradas.

| Versao | Tabela | Funcao |
| --- | --- | --- |
| V2 | public.faq | FAQ e horario institucional, ja existente no historico |
| V3 | public.n8n_chat_histories | Memoria de conversa por sessao |
| V4 | public.follow_ups_temporary | Ciclos, comprovantes e encerramento de follow-up |
| V5 | public.follow_up_opt_outs | Recusa persistente por lead |
| V6 | public.ev05_solicitacoes_automacao | Deduplicacao de solicitacoes de resumo |
| V7 | public.ev07_envios_automaticos | Reservas e comprovantes de envios recorrentes |
| V8 | public.ev17_segmentacoes | Controle de alteracao de etapa por inatividade |
| V9 | public.ev17_cursores | Continuacao da varredura |

Esquemas completos, tipos, defaults e indices estao nos SQL e no
[inventario](../homologacao/INVENTARIO-TABELAS-AUXILIARES-ESTRUTURAL.md).
Foram preservados os nomes da origem, inclusive campos Meta/clinica/paciente,
sem inventar novas exigencias ou renomear campos usados pelos fluxos.
`created_at` da memoria permanece nullable conforme o SQL levantado.
Nao ha seeds, triggers novos, importacao de dados nem FOREIGN KEY para o CRM.

## Aplicacao pelo deploy normal

O Stack monta todos os arquivos V1-V9 no preparador `automacao-banco`, usando
configs Swarm exclusivos da automacao. Nao exige publicar outra imagem nem
alterar tags, backend Java, frontend CRM, init do PostgreSQL ou volumes.

Depois do push autorizado, executar o deploy normal da branch de homologacao
com `AUTOMACAO_PROVISIONAR_REPLICAS=1`. O preparador preserva o clone existente,
verifica checksums e aplica somente versoes pendentes como usuario da automacao.
`AUTOMACAO_REPLICAS` pode permanecer zero para este provisionamento.

O historico fica em `automacao_infra.migracao`. Uma transacao/advisory lock
protege a aplicacao das versoes. A repeticao nao apaga registros. Tabela criada
fora do historico ou checksum divergente causam erro, sem assumir compatibilidade
ou apagar o conflito. Nao editar V1/V2 para contornar erros.

Log esperado: `Migracoes da automacao aplicadas e verificadas`.
Criar essas estruturas nao ativa nenhum fluxo, cron ou envio automatico.

## Credenciais dos fluxos n8n

Criar tabelas nao troca os destinos dos nodes. No levantamento atual, os nodes
de memoria/controles do HML ainda usam `HML PostgreSQL CRM`, e apenas os de FAQ
ja usam `HML PostgreSQL Automacao`. O remapeamento dos demais nodes e uma etapa
separada, apos confirmar as migrations aplicadas e com autorizacao.

O node `Limpar memoria e follow-ups do #sair` exige memoria E controle de
follow-up no mesmo banco. Os nodes que finalizam atendimento/desvinculam lead
devem continuar usando o CRM. Nenhum node deve usar o banco interno do n8n.

## Verificacao

- Testes locais validam o executor, os nove arquivos montados no Stack e tipos TS.
- O fixture Docker isolado testa V1-V9 em PostgreSQL real, colunas, valores padrao,
  constraints de duplicacao, dados vazios e preservacao ao repetir as migrations.
- Tambem simula um banco com V1/V2 e FAQ preenchida, aplicando apenas V3-V9.
- O fixture nao carrega .env nem conecta a qualquer banco de homologacao/producao.
- Sem daemon Docker local, o teste real de PostgreSQL deve rodar no CI; testes
  unitarios nao sao prova de que migrations ja executaram no servidor.
