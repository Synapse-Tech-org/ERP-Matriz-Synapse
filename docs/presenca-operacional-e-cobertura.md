# Presença operacional da equipe

## Gestão → Equipe

Abra a ficha da pessoa no V2 (ou a ação Status operacional na lista legada).
A ficha distingue a presença registrada pelo CRM, o status operacional efetivo,
o toggle de liberação e o primeiro motivo pelo qual a pessoa não entra no
rodízio global. Um setor específico ainda pode restringir esse conjunto.

- **Alterar status** exige `equipe.disponibilidade_ia`, papel de gestão e a
  alçada já usada na gestão de integrantes. Um subgestor delegado só altera
  atendentes, nunca a si ou outro subgestor. Usuários inativos, de teste e
  papéis que não recebem atendimentos não são alvos.
- **Online** declara um ajuste operacional, não uma sessão: não habilita o
  toggle e não transforma ausência ou falta de presença Online em elegibilidade.
- **Offline** e **Em pausa** bloqueiam a lista de candidatos e o vínculo
  preferencial enquanto vigentes. Login, WebSocket e a escolha de presença
  do próprio atendente continuam atualizando o estado original e não apagam
  o ajuste. Ao expirar, a leitura seguinte usa o estado original vigente.
- A validade é obrigatória e informada no fuso da instância, sem presumir
  o fuso do navegador. Horários ambíguos ou inexistentes são recusados.
  A auditoria grava ator, alvo, estados efetivos anterior/novo, instante e
  validade na mesma transação protegida pela trava do integrante.

`GET/PATCH /api/v1/usuarios/{id}/status-operacional` é aditivo e não altera
`/me/presenca` nem o contrato da Automação. O PATCH recebe, por exemplo,
`{"status":"PAUSA","validoAte":"2026-12-01T15:00"}`. A resposta inclui o
fuso e o resumo. A ficha é a única consulta nova da interface, sob demanda;
o rodízio verifica os bloqueios nas consultas de candidatos existentes.

## Operação na Fêmina

Esta etapa não exige variável de ambiente nem habilitação adicional. Após
deploy e migração pela operação, abrir um integrante controlado em Gestão →
Equipe e conferir presença, liberação e motivo de exclusão. Em homologação,
escolher pausa futura e verificar que login/presença Online não a removem;
depois conferir a elegibilidade após a validade. Verificar o status de presença
automática e a estratégia de distribuição da instância separadamente, sem
ligar chaves por tentativa e erro. Online operacional não substitui a
configuração da presença automática.

Em 24/11/2026, a operação informou 8 ativos, 5 elegíveis por papel,
2 liberados e 0 online entre os liberados. Essa combinação explica
`SEM_ATENDENTE_ONLINE` pelas regras atuais; um subgestor online com toggle
desligado não entra. Não foi repetido em produção, nem é prova de que a
presença automática estava desligada no momento de cada ocorrência — o
estado desligado foi observado posteriormente.

## Próxima etapa — escala e contingência (ainda não disponível nesta etapa)

Pausas futuras, férias e afastamentos devem usar intervalos de início
inclusivo/fim exclusivo, planejados no fuso civil da instância e comparados
por instante. Um afastamento ativo deve prevalecer sobre qualquer ajuste
operacional. A cobertura cadastrada por setor é tentada depois dos
candidatos normais: foi decidido que **também exige presença Online no CRM**,
além de liberação para IA e ausência de bloqueios. Não há fallback para
outro setor não cadastrado. Sem setores, o rodízio usa o conjunto global
e, se vazio, mantém o atendimento em Potenciais. Sem nova tentativa
automática. A capacidade separada deve nascer desligada.
