# Estado da paridade em 14/11/2026

Referências: CRM SYNAPSE MOCKUP (2) e Artbook clínico. A conferência no navegador
foi local, com dados de teste. A paridade inclui aparência e comportamento.
Onde há somente leitura de código ou testes de fluxo, a aparência ainda
precisa de comparação no ambiente de homologação.

| Área | O que corresponde ou funciona | O que falta conferir ou entregar |
| --- | --- | --- |
| Sidebar | Vidro e ordem do grupo Principal clínico vistos no navegador. Uma rota ativa por vez. | Brilho, contraste e ícones com os temas reais dos clientes. |
| Agenda de Consultas | Faixa de dias, pesquisa, seletor Lista/Por profissional, cartões com cores e detalhes funcionais. A grade exibe registros reais do dia. | O Artbook tem uma grade por horários, agenda de disponibilidade, intervalos, encaixe e resumo de confirmações. A grade desta entrega agrupa as consultas registradas, com cartões em ordem de horário. Os indicadores ainda usam os estados disponíveis no CRM e não reproduzem exatamente o resumo do Artbook. |
| Pacientes | Cadastro do CRM, ficha, filtros e ações por permissões. A Agenda abre a ficha do paciente pelo vínculo. | Conferir tabela preenchida, tons e ações na homologação. |
| Cancelamentos | Filtros, tabela/cartões, detalhes, CSV e acesso às consultas canceladas no próprio CRM. | O registro recebido de integrações não informa recuperação ou novo horário. Os indicadores de reagendamento do Artbook dependem dessa informação. |
| Atendimentos e Dashboard | Existem suítes do layout V2 para conversa, composer, painel, filtros e tamanhos de tela. | Repetir as comparações na imagem atual e com os temas reais. |
| Relatórios | O relatório abre a conversa pelo ID do atendimento quando há permissão. | Conferir esse percurso no navegador da homologação e comparar gráficos, tabelas e filtros com o mockup. |
| Automação | O CRM tem formulários e configurações, inclusive observações, confirmação e lembretes de consultas. | Validar o efeito dos envios no ambiente integrado. Base de conhecimento e teste do assistente dependem do motor externo. |
| Gestão, Configurações, Templates, Mensagens Rápidas, Lembretes, Programadas, Tags, Campanhas, Chat Interno e Feedbacks | As rotas têm implementação no CRM. | A conferência de paridade visual e a validação de todos os atalhos, formulários e permissões na imagem atual continuam abertas. |

Banco de Arquivos e Horários seguem fora do escopo combinado.

O Artbook exibe células de horários livres, mas o CRM armazena somente
agendamentos e impede duplicidade de horário inicial. Por isso a grade agrupa
consultas existentes e não oferece encaixes ou sinaliza disponibilidade.
A comparação visual usou 1440 × 900 e 390 × 844. Dados do HTML de referência
não entram no produto.
