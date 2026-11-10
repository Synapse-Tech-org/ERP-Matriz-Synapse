-- Chat interno: por que um usuario nao ve as mensagens antigas de um grupo. SOMENTE LEITURA.
--
-- Contexto: o Financeiro relatou que nao enxerga, em grupos como "Descontos" e "Comprovantes", o que foi
-- escrito antes de 27/10, e que anexos so aparecem a partir de "ontem". O codigo mostra duas coisas:
--   (a) a tela so buscava a primeira pagina (50 mensagens) e ignorava o proximoCursor: corrigido na PR;
--   (b) o servidor nao filtra por quem entrou quando (chat_interno_participante nao guarda data de
--       entrada), mas a consulta de mensagens faz JOIN em usuario_visivel, que esconde remetentes marcados
--       como conta de teste (V107) de quem nao e administrador.
-- Este script separa o que ha no banco do que o usuario realmente enxerga, para dizer se sobra algum
-- caso fora de (a). Um grupo com poucas mensagens (como o "Descontos" do relato: 4) nao se explica por (a).
--
-- Nada altera dados. Os blocos 1-3 leem como dono do banco; o bloco 4 reproduz o contexto da aplicacao
-- (SET LOCAL ROLE synapse_app + app.usuario_id + app.papel, como o AplicadorDeContextoRls) e termina em
-- ROLLBACK. Sem esse contexto a consulta rodaria fora da RLS e nao mostraria o que o usuario ve.
--
-- Uso (psql, superusuario ou dono do banco):
--   psql -d <banco> -v grupo='Descontos%' -v usuario=<uuid do usuario do Financeiro> -v papel=ATENDENTE \
--        -f chat-interno-historico-diagnostico.sql
--
-- Como ler:
--   bloco 1 "mensagens_no_banco" == bloco 4 "visiveis_para_o_usuario"  -> o servidor entrega tudo; o corte era
--       da tela (a) ou o grupo realmente so tem essas mensagens (criado perto de 27/10).
--   bloco 4 menor que o bloco 1                                      -> ha filtro no servidor; o bloco 3 lista
--       os remetentes de conta de teste que o JOIN descarta.
--   bloco 4 sem nenhuma linha                                        -> o usuario nao participa do grupo (bloco 2).
\set ON_ERROR_STOP on
\pset pager off

-- 1) O que existe no banco, por conversa.
SELECT c.id,
       c.nome,
       c.tipo,
       c.criado_em,
       count(m.id)                                                            AS mensagens_no_banco,
       min(m.enviado_em)                                                      AS primeira,
       max(m.enviado_em)                                                      AS ultima,
       count(*) FILTER (WHERE m.enviado_em < timestamptz '2026-10-27 00:00-03') AS antes_de_27_10,
       count(*) FILTER (WHERE m.removida_em IS NOT NULL)                      AS removidas
  FROM chat_interno_conversa c
  LEFT JOIN chat_interno_mensagem m ON m.conversa_id = c.id
 WHERE c.nome ILIKE :'grupo'
 GROUP BY c.id
 ORDER BY c.criado_em;

-- 2) Quem participa. O usuario do relato precisa estar aqui; a tabela nao guarda data de entrada.
SELECT c.nome AS grupo, u.nome AS participante, u.papel, u.ativo, u.usuario_teste
  FROM chat_interno_conversa c
  JOIN chat_interno_participante p ON p.conversa_id = c.id
  JOIN usuario u ON u.id = p.usuario_id
 WHERE c.nome ILIKE :'grupo'
 ORDER BY c.nome, u.nome;

-- 3) Remetentes que o JOIN com usuario_visivel descartaria para quem nao e administrador.
--    Esperado: nenhuma linha (a V107 impede marcar como teste quem ja tem mensagem).
SELECT c.nome AS grupo, u.nome AS remetente, u.usuario_teste, count(*) AS mensagens_descartadas
  FROM chat_interno_mensagem m
  JOIN chat_interno_conversa c ON c.id = m.conversa_id
  JOIN usuario u ON u.id = m.remetente_id
 WHERE c.nome ILIKE :'grupo'
   AND u.usuario_teste
 GROUP BY c.nome, u.nome, u.usuario_teste;

-- 4) O que o usuario enxerga de fato: a mesma consulta do backend (ChatInternoRepositorioJdbc.listarMensagens),
--    sem o LIMIT, dentro da RLS dele.
BEGIN;
SET LOCAL ROLE synapse_app;
SELECT set_config('app.usuario_id', :'usuario', true);
SELECT set_config('app.papel', :'papel', true);
SELECT c.nome AS grupo,
       count(*)           AS visiveis_para_o_usuario,
       min(m.enviado_em)  AS primeira_visivel
  FROM chat_interno_mensagem m
  JOIN usuario_visivel u ON u.id = m.remetente_id
  JOIN chat_interno_conversa c ON c.id = m.conversa_id
 WHERE c.nome ILIKE :'grupo'
 GROUP BY c.nome;
ROLLBACK;
