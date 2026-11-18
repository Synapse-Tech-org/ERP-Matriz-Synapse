# 78 — Gestão › Configurações gerais

Aba nova da Gestão, ao lado de **Equipe** e **Perfis de acesso**, que reúne as regras de funcionamento que
valem para toda a instância. Ela não cria um armazenamento novo: cada linha edita uma chave já existente
(ou criada pela `V126`) de `configuracao_automacao`, pelo CRUD de sempre (`GET`/`PUT /api/v1/automacao/config`).

## Quem vê e quem edita

| Ação | Regra (a mesma do backend) |
|---|---|
| Ver a aba | Gestor, Subgestor ou Administrador com a capacidade `automacao.ver` |
| Alterar valores | Capacidade `automacao.editar_parametros` |

Sem permissão de edição, a aba aparece inteira, com os controles travados e o aviso "somente leitura".
Uma chave que não existe na instância não vira controle: a linha simplesmente não aparece.

## O que está na aba

| Seção | Item | Chave |
|---|---|---|
| Atendimentos | **Finalizar atendimentos no fim do expediente** (novo) | `atendimento.finalizar_fim_expediente.habilitado` |
| | Quando finalizar: no fim do expediente de cada dia ou em horário fixo | `atendimento.finalizar_fim_expediente.usar_expediente`, `atendimento.finalizar_fim_expediente.horario` |
| | Finalizar atendimentos parados | `atendimento.finalizar_inativos.habilitado` |
| | Parado há mais de N horas | `atendimento.finalizar_apos_horas` |
| | Atraso sem resposta (minutos) | `atendimentos.limite_sem_resposta_minutos` |
| | Presença automática | `presenca.automatica` |
| | Duração máxima do áudio (segundos) | `gravacao_audio.duracao_maxima_segundos` |
| Horário de funcionamento | Expediente padrão (início e fim) | `alerta.horario_cliente.inicio`, `alerta.horario_cliente.fim` |
| | Por dia da semana: igual ao padrão, fechado ou horário próprio | `alerta.horario_cliente.<seg…dom>` |
| Avaliação do atendimento | Pesquisa de avaliação | `avaliacao_atendimento.habilitada` |
| | Pergunta NPS e texto | `avaliacao_atendimento.nps_habilitado`, `avaliacao_atendimento.nps_pergunta` |

Essas chaves **saíram de Automação › Parâmetros avançados**, para não haver dois lugares editando o mesmo
valor (`pertenceAsConfiguracoesGerais` em `frontend/src/lib/gestao/configuracoes-gerais.ts`).

## Finalização no fim do expediente

Pedido da operação: encerrar todos os dias, sozinho, o que ficou aberto.

- **Desligada por padrão** em todas as instâncias (`V126`).
- **Horário:** por padrão, o fim do expediente do dia na janela `alerta.horario_cliente.*`, que é a mesma
  usada pelo alerta de saúde ao cliente. Respeita a faixa própria de cada dia; dia marcado como **fechado**
  não tem finalização. Com "Em um horário fixo", vale `atendimento.finalizar_fim_expediente.horario` todos os dias.
- **O que finaliza:** atendimentos humanos (`EM_ATENDIMENTO`) sem mensagem desde o horário. Quem trocou
  mensagem depois do horário continua aberto.
- **O que não finaliza:** atendimentos com a IA (`EM_IA`, fila de Potenciais) e negociação sem resultado
  escolhido. Estes últimos ficam para o atendente decidir.
- **Sem pesquisa de avaliação:** o encerramento é do relógio, não do atendente; mandar a pesquisa para todos
  os clientes ao mesmo tempo seria spam. Na timeline, o encerramento aparece como "finalizado pela Automação".
- **Uma vez por dia:** o job (`AgendadorDeFinalizacaoNoFimDoExpediente`) verifica a cada minuto
  (`synapse.atendimento.finalizar-fim-expediente.intervalo-ms`, padrão 60000). Ao passar do horário, reserva o
  dia em `finalizacao_fim_expediente_execucao`; com várias réplicas ou reinício, só quem reserva executa.
- **Sem efeito retroativo:** só age até **2 horas** depois do horário. Ligar o toggle à noite, ou o backend
  voltar de madrugada, não encerra o dia de ninguém; a primeira finalização acontece no próximo horário.
- Lotes de `synapse.atendimento.finalizar-inativos.lote` (padrão 50), cada atendimento em sua própria transação.
  O resultado do dia fica na tabela e no log (`Finalização do fim do expediente de …`).

```sql
-- Histórico das execuções
SELECT dia, iniciada_em, concluida_em, finalizados, ignorados, falhas
  FROM finalizacao_fim_expediente_execucao ORDER BY dia DESC LIMIT 10;
```

## Expediente por dia da semana

O CRUD só edita linhas existentes e não apaga chave. Por isso a `V126` cria as sete chaves
`alerta.horario_cliente.<dia>` com o valor `padrao`, equivalente a não ter a chave (o dia usa a janela padrão).
Valores aceitos: `padrao`, `fechado` ou `HH:mm-HH:mm`. Instâncias que já tinham um dia configurado à mão
mantêm o valor (`ON CONFLICT DO NOTHING`).

**Atenção:** marcar um dia como fechado também desliga, naquele dia, o aviso de saúde crítica ao cliente.
É o mesmo horário comercial.

## Depois do deploy

1. A `V126` roda sozinha no boot.
2. A lista de parâmetros fica em cache no Redis por até **5 minutos** (`AUTOMACAO_CONFIG_CACHE_TTL`). Se a
   aba abrir sem os itens novos logo após o deploy, espere esse tempo ou recarregue depois.
3. Para ligar na instância: Gestão › Configurações gerais › **Finalizar atendimentos no fim do expediente**.
   Ou, pelo banco:

```sql
UPDATE configuracao_automacao SET valor = 'true'
 WHERE chave = 'atendimento.finalizar_fim_expediente.habilitado';
```
