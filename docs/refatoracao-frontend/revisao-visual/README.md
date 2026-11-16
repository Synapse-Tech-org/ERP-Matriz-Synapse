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
| Tags | `/tags` | Refeita (indicadores + tabela). Criar, buscar, editar e remover exercitados. |
| Feedbacks | `/feedbacks` | Formulário refeito em passos. Envio e validação exercitados. |
| Cabeçalho das páginas (trilha, busca, título) | páginas `lista-v2` | Corrigido na origem comum. |
| Mensagens Rápidas, Programadas, Lembretes, Agenda, Gestão, Dashboard, Templates, Automação, Relatórios | — | Estrutura confere; trilha corrigida onde divergia. Detalhes finos abaixo. |
| Campanhas, Configurações | `/campanhas`, `/configuracoes` | **Pendente.** Divergem na estrutura (cabeçalho e indicadores de Campanhas; cartões de seção de Configurações). |
| Administração, Onboarding | — | **Não comparadas.** |
| Horários, Banco de Arquivos | — | Sem tela no CRM (ver diferenças justificadas). |

## Evidências

| Antes | Depois | Mockup |
| --- | --- | --- |
| `sidebar-antes.png` | `sidebar-depois.png` | (as duas imagens trazem mockup e CRM lado a lado) |
| `atendimentos-antes-1920.png` | `atendimentos-depois-1920.png`, `atendimentos-depois-1440.png` | `atendimentos-mockup-1920.png` |
| — | `tags-depois-1920.png`, `tags-depois-390.png` | `tags-mockup-1920.png` |
| — | `feedbacks-depois-1920.png` | `feedbacks-mockup-1920.png` |
| — | `abas-filtro-1366.png` (abas com filtro ativo, sem corte) | — |

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
- **Horários e Banco de Arquivos.** Não há backend; pela regra de não mockar dados, as rotas
  continuam mostrando o estado "área não construída".
- **Rótulos do catálogo.** "Templates WhatsApp", "Buscar contatos…" e "Ctrl K" seguem o
  `textos.json`; o mockup usa "Templates", "Buscar…" e "⌘K".
- **Ordem de tabulação do composer.** O campo de texto sobe por CSS; a ordem no DOM continua
  ferramentas → campo → enviar.

## Pendências de detalhe

- Agenda: telefone sem máscara, altura de linha 55 px (mockup 62 px), etiquetas sem ícone.
- Lembretes e Programadas: formato de data ("dom., 15/11" × "Ontem"), ícones de ação em vermelho.
- Mensagens Rápidas: cor dos ícones de ação e rótulo "Todas" × "Todas as listas".
- Gestão: rótulo da busca do topo alinhado à direita.
