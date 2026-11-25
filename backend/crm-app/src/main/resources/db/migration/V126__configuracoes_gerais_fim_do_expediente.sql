-- Gestão › Configurações gerais.
--
-- 1) Finalização diária no fim do expediente: nasce DESLIGADA em todas as instâncias. Por padrão o horário
--    é o fim da janela de expediente do dia (alerta.horario_cliente.*); com usar_expediente = false vale o
--    horário fixo. Não envia pesquisa de avaliação e não mexe em atendimentos com a IA (EM_IA).
INSERT INTO configuracao_automacao
    (chave, valor, unidade, tipo, valor_min, valor_max, descricao)
VALUES
    ('atendimento.finalizar_fim_expediente.habilitado', 'false', NULL, 'BOOLEAN', NULL, NULL,
     'Finaliza todos os dias, no fim do expediente, os atendimentos humanos sem atividade desde o horário.'),
    ('atendimento.finalizar_fim_expediente.usar_expediente', 'true', NULL, 'BOOLEAN', NULL, NULL,
     'Usa o fim do horário de expediente de cada dia; desligado, usa o horário fixo.'),
    ('atendimento.finalizar_fim_expediente.horario', '18:00', 'HH:mm', 'TEXT', NULL, NULL,
     'Horário fixo da finalização diária, quando não segue o expediente.')
ON CONFLICT (chave) DO NOTHING;

-- 2) Expediente por dia da semana. O CRUD de configuração só edita linhas existentes e não apaga chave;
--    'padrao' é o valor explícito de "este dia usa a janela padrão" (comportamento idêntico a não ter a
--    chave). Instâncias que já configuraram um dia manualmente mantêm o valor (DO NOTHING).
INSERT INTO configuracao_automacao
    (chave, valor, unidade, tipo, valor_min, valor_max, descricao)
VALUES
    ('alerta.horario_cliente.seg', 'padrao', NULL, 'TEXT', NULL, NULL, 'Expediente de segunda: padrao, fechado ou HH:mm-HH:mm.'),
    ('alerta.horario_cliente.ter', 'padrao', NULL, 'TEXT', NULL, NULL, 'Expediente de terça: padrao, fechado ou HH:mm-HH:mm.'),
    ('alerta.horario_cliente.qua', 'padrao', NULL, 'TEXT', NULL, NULL, 'Expediente de quarta: padrao, fechado ou HH:mm-HH:mm.'),
    ('alerta.horario_cliente.qui', 'padrao', NULL, 'TEXT', NULL, NULL, 'Expediente de quinta: padrao, fechado ou HH:mm-HH:mm.'),
    ('alerta.horario_cliente.sex', 'padrao', NULL, 'TEXT', NULL, NULL, 'Expediente de sexta: padrao, fechado ou HH:mm-HH:mm.'),
    ('alerta.horario_cliente.sab', 'padrao', NULL, 'TEXT', NULL, NULL, 'Expediente de sábado: padrao, fechado ou HH:mm-HH:mm.'),
    ('alerta.horario_cliente.dom', 'padrao', NULL, 'TEXT', NULL, NULL, 'Expediente de domingo: padrao, fechado ou HH:mm-HH:mm.')
ON CONFLICT (chave) DO NOTHING;

-- 3) Reserva diária: garante uma execução por dia mesmo com várias réplicas ou reinício do backend.
--    Sem dado de lead, sem RLS; o acesso da role da aplicação vem dos DEFAULT PRIVILEGES (V13).
CREATE TABLE finalizacao_fim_expediente_execucao (
    dia          DATE        PRIMARY KEY,
    iniciada_em  TIMESTAMPTZ NOT NULL,
    concluida_em TIMESTAMPTZ,
    finalizados  INTEGER,
    ignorados    INTEGER,
    falhas       INTEGER
);
COMMENT ON TABLE finalizacao_fim_expediente_execucao IS
    'Uma linha por dia em que a finalização do fim do expediente rodou (Gestão › Configurações gerais).';
