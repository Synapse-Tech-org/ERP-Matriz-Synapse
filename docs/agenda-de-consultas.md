# Agenda de consultas e Pacientes

A flag existente `variante_clinica` disponibiliza **Agenda de consultas** em
`/agenda-consultas` e apresenta o cadastro de contatos como **Pacientes** em
`/agenda`. O cadastro, a busca, o CSV e as fichas continuam na API de leads.
O link para uma ficha a partir da agenda revalida o acesso normal ao lead.

A agenda grava agendamentos no próprio CRM. A migração V124 cria uma tabela
genérica sem prontuário, telefone duplicado ou configuração por cliente.
Profissional, tipo e cobertura são rótulos informados pela recepção. A data
usa o fuso da instância. O banco impede reservar o mesmo horário de início
para o mesmo profissional, sem diferenciar maiúsculas. Cancelar libera a
reserva. O horário pode ser alterado enquanto a consulta estiver agendada ou
confirmada.

| HTTP | Operação |
|---|---|
| `GET /api/v1/agenda-consultas` | Dia no fuso da instância, busca e estado opcionais |
| `POST /api/v1/agenda-consultas` | Cria uma consulta para um lead visível |
| `PATCH /api/v1/agenda-consultas/{id}` | Muda o estado ou horário com a revisão atual |

Leitura exige `clientes.acessar`, e gravação também exige `contatos.editar`.
A Specification do cadastro e a RLS são aplicadas antes de ordenar e limitar
os resultados. Consulta ou lead fora da carteira devolve 404. Conflitos de
horário, revisão ou transição devolvem 409. A agenda limita a leitura a 250
itens do dia por padrão (`synapse.agenda.limite-dia`) e sinaliza a limitação.

O painel de Cancelamentos recebidos de integrações mantém seu contrato. Seu
atalho **Canceladas na agenda do CRM** abre os registros manuais com filtro
aplicado. Criar, confirmar e cancelar na agenda não dispara mensagens,
não atualiza o status do atendimento do WhatsApp e não sincroniza
agendamentos de sistemas externos.
