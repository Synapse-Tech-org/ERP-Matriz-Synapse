# Revisão visual contra o mockup — 16/11/2026

Referência: `CRM SYNAPSE MOCKUP (2).html` (18 telas, canvas fixo de 1920×1080).
Comparação feita com o CRM real em ambiente local de teste: backend no perfil `dev`
sobre um banco isolado, com as flags `*_layout_v2` e `chat_interno_sem_trilho` ligadas,
dados sintéticos e o `tema-referencia.json`. Mesma janela (1920×1080), zoom e tema nos
dois lados; larguras menores conferidas só no CRM, porque o mockup não é responsivo.

## Cobertura

| Tela do mockup | Rota | Situação |
| --- | --- | --- |
| Sidebar (recolhida, expandida por hover, fixada) | todas | Corrigida e medida elemento a elemento. |
| Atendimentos — lista, cabeçalho, bolhas, composer, ficha | `/atendimentos` | Corrigida. Ficha vem da PR 355, mesclada aqui. |
| Aba Interno | `/atendimentos` | Nova: lista só os chats internos quando o chat interno está habilitado no V2. |
| Tags | `/tags` | Refeita (indicadores + tabela). Criar, buscar, editar e remover exercitados. |
| Feedbacks | `/feedbacks` | Formulário refeito em passos. Envio e validação exercitados. |
| Cabeçalho das páginas (trilha, busca, título) | páginas `lista-v2` | Corrigido na origem comum. |
| Agenda | `/agenda` | Telefone com máscara nacional, linhas de 62 px, etapa com ponto, etiquetas maiores, "Há 1 h" com inicial maiúscula. |
| Lembretes | `/lembretes` | Data relativa ("Ontem · 07:28", "Amanhã · 02:28", "qui 19/11 · 00:28") em uma linha; excluir neutro até a interação. |
| Mensagens Programadas | `/mensagens-programadas` | Selo "Hoje"/"Amanhã" no grupo, dia por extenso sem ano ("Terça, 17 de novembro"), "Próximo envio" curto; excluir neutro. |
| Mensagens Rápidas | `/mensagens-rapidas` | Ações do cartão neutras e menores. |
| Gestão | `/gestao` | Rótulo da busca do topo alinhado à esquerda. Demais elementos já conferiam. |
| Campanhas | `/campanhas` | Cabeçalho, indicadores (limite + desempenho com proporção e barra) e tabela refeitos. Comparada vazia e com quatro campanhas sintéticas (rascunho, agendada, pausada, concluída). |
| Configurações | `/configuracoes` | Navegação, Notificações, Interface (um cartão de aparência, tema com seleção, tamanho e densidade lado a lado, "Enter envia" em linha) e Ajuda (cartão de apoio) refeitas. Perfil já conferia. |
| Administração | `/administracao`, `/acessos`, `/feedbacks` | Refeita: sai a barra superior e o menu lateral; entram trilha, título e abas no cabeçalho, com indicadores em cartão. |
| Dashboard, Templates, Automação, Relatórios | — | Estrutura confere; trilha corrigida onde divergia. |
| Onboarding | — | Sem tela no CRM (ver diferenças justificadas). |
| Horários, Banco de Arquivos | — | Sem tela no CRM (ver diferenças justificadas). |

## Evidências

| Antes | Depois | Mockup |
| --- | --- | --- |
| `sidebar-antes.png` | `sidebar-depois.png` | (as duas imagens trazem mockup e CRM lado a lado) |
| `atendimentos-antes-1920.png` | `atendimentos-depois-1920.png`, `atendimentos-depois-1440.png` | `atendimentos-mockup-1920.png` |
| — | `tags-depois-1920.png`, `tags-depois-390.png` | `tags-mockup-1920.png` |
| — | `feedbacks-depois-1920.png` | `feedbacks-mockup-1920.png` |
| — | `abas-filtro-1366.png` (abas com filtro ativo, sem corte), `aba-interno-1920.png` | — |
| `campanhas-tabela-antes-1920.png` | `campanhas-depois-1920.png` | `campanhas-mockup-1920.png` |
| — | `configuracoes-depois-1920.png` | `configuracoes-mockup-1920.png` |
| `configuracoes-interface-antes-1920.png` | `configuracoes-interface-depois-1920.png` | `configuracoes-interface-mockup-1920.png` |
| `administracao-antes-1920.png` | `administracao-depois-1920.png`, `administracao-acessos-depois-1920.png`, `administracao-acessos-depois-390.png` | `administracao-mockup-1920.png` |
| — | `agenda-depois-1920.png`, `lembretes-depois-1920.png`, `programadas-depois-1920.png`, `rapidas-depois-1920.png`, `gestao-depois-1920.png` | — |
| — | — | `onboarding-mockup-1920.png` |

Fixar e soltar a sidebar em Atendimentos foi amostrado quadro a quadro: lista, conversa e
ficha ficam contíguas em todos os quadros, a conversa cede de 468 para 668 px e volta, e a
barra permanece em 268 px durante a animação. Conversa aberta e rascunho do composer são
preservados.

## Diferenças justificadas

- **Fundo do canvas.** O HTML de referência não traz a imagem de fundo empacotada e aparece
  cinza; o CRM usa a imagem do protótipo original.
- **Data nas bolhas.** O mockup mostra só a hora. O CRM mantém data e hora, exigidas por
  teste de produto (`bolha-mensagem.test.tsx`).
- **Novidades na sidebar.** Não aparece porque `novidades.titulo` está fora do catálogo de
  textos (recurso desativado).
- **Menu "⋮" por cartão e nome da cor da tag.** Não existem ação nem dado equivalentes; não
  foram criados controles sem função.
- **Empresa no cartão da lista.** Oculta no V2 como no mockup; segue no cabeçalho e na ficha.
- **Onboarding (tour em vídeo).** Não existe tela, vídeo nem registro de "primeiro acesso" no
  produto; criar a tela exigiria conteúdo e backend que não existem.
- **Administração › selo "Acesso restrito", abas Novidades e Tutoriais.** Excluídos por teste
  de produto (`layout-administracao.test.tsx`).
- **Administração › Dados do cliente, Ambiente, Integrações, logins em 30 dias e
  disponibilidade.** Não há API para esses dados; os quatro indicadores reais (usuários
  cadastrados, ativos, online e recursos habilitados) ocupam a faixa de cartões. O estado do
  sistema continua "Estado não verificado", como o produto já informa.
- **Configurações › Por e-mail e "Testar aviso".** Não há preferência nem ação equivalentes.
- **Configurações › Interface › painel de prévia e idioma.** A prévia do mockup é uma conversa
  fictícia e o produto não tem troca de idioma; os cartões de tema já mostram o efeito.
- **Configurações › Ajuda › Manual, Tutoriais, Novidades e "Sobre o sistema".** Não há
  material, rota nem API de versão; fica só "Sugestões e problemas", que leva a Feedbacks.
- **Campanhas › busca, abas por status e ações Pausar/Duplicar na linha.** A API da lista não
  filtra por texto nem por status e as ações vivem na tela de detalhe; a linha leva a ela.
  O selo "Beta" e "renova às 00:00" também não têm dado correspondente.
- **Campanhas › indicador "Enviadas" e pílula de falhas.** O CRM mantém os quatro indicadores
  existentes (entregues, lidas, respostas, falhas), agora com a proporção sobre as enviadas.
- **Agenda › ícone nas etiquetas e selo "Sem retorno".** A tag não tem ícone cadastrado e não
  há dado de "sem retorno" na lista.
- **Mensagens Rápidas › "Todas" × "Todas as listas", "Visível para toda a equipe" e "Como
  usar".** Rótulos seguem o `textos.json`.
- **Lembretes › "há 1 dia" × "atrasado 17 h".** O texto relativo vem de `Intl.RelativeTimeFormat`.
- **Horários e Banco de Arquivos.** Não há backend; pela regra de não mockar dados, as rotas
  continuam mostrando o estado "área não construída".
- **Rótulos do catálogo.** "Templates WhatsApp", "Buscar contatos…" e "Ctrl K" seguem o
  `textos.json`; o mockup usa "Templates", "Buscar…" e "⌘K".
- **Ordem de tabulação do composer.** O campo de texto sobe por CSS; a ordem no DOM continua
  ferramentas → campo → enviar.

## Não verificado

- Tema escuro nas telas refeitas nesta rodada (só o tema claro foi capturado).
- Campanhas com status "Em andamento" e "Pausada automaticamente" (não semeadas para não
  acionar o motor de envio no ambiente de teste).
