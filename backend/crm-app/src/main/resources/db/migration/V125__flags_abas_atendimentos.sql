-- Abas opcionais da lista de Atendimentos (layout V2). Ambas nascem desligadas em todas as instâncias.
-- atendimentos_aba_interno: mostra a aba "Interno" com só os chats internos (exige chat_interno).
-- atendimentos_finalizados_so_no_menu: tira "Finalizados" da faixa de abas do gestor; o acesso fica no menu "⋮".
INSERT INTO feature_flag (chave, habilitado, descricao)
VALUES
  ('atendimentos_aba_interno', false, 'Aba "Interno" na lista de Atendimentos V2, só com os chats internos.'),
  ('atendimentos_finalizados_so_no_menu', false, 'Finalizados fora da faixa de abas do gestor; acesso pelo menu da lista.')
ON CONFLICT (chave) DO NOTHING;
