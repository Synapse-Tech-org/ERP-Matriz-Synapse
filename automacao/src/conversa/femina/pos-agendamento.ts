import type { Pool } from 'pg';

export interface AgendamentoConfirmado {
  clinicaId: number; pacienteId: number; scheduleId: string;
  inicio: string; fim: string; procedimento: string; cpf: string;
}

export class PosAgendamento {
  // Banco operacional da clinica, nunca o banco tecnico da automacao.
  constructor(private readonly banco: Pick<Pool,'connect'>) {}

  async registrar(a: AgendamentoConfirmado) {
    if (!a.scheduleId.trim() || !a.cpf.trim() || !Number.isSafeInteger(a.clinicaId) || a.clinicaId <= 0 ||
        !Number.isSafeInteger(a.pacienteId) || a.pacienteId <= 0 || !(Date.parse(a.fim) > Date.parse(a.inicio)))
      throw new Error('POS_AGENDAMENTO_INVALIDO');
    const c = await this.banco.connect();
    try {
      await c.query('BEGIN');
      const paciente = await c.query('UPDATE public.paciente SET cpf_new=$1, atualizado_em=now() WHERE id=$2 AND clinica_id=$3',
        [a.cpf,a.pacienteId,a.clinicaId]);
      if (paciente.rowCount !== 1) throw new Error('PACIENTE_DA_CLINICA_NAO_ENCONTRADO');
      const r = await c.query(`INSERT INTO public.agendamento
        (clinica_id,paciente_id,external_source,external_id,data_hora_inicio,data_hora_fim,tipo,servico_nome,status,origem,external_payload,criado_em,atualizado_em)
        VALUES ($1,$2,'DARWIN',$3,$4,$5,$6,$6,'AGENDADO','INTEGRACAO_EXTERNA',$7,now(),now())
        ON CONFLICT (external_id) DO UPDATE SET data_hora_inicio=EXCLUDED.data_hora_inicio,
          data_hora_fim=EXCLUDED.data_hora_fim,status=EXCLUDED.status,external_payload=EXCLUDED.external_payload,atualizado_em=now()
        WHERE agendamento.clinica_id=EXCLUDED.clinica_id AND agendamento.paciente_id=EXCLUDED.paciente_id
          AND agendamento.external_source='DARWIN'`,[a.clinicaId,a.pacienteId,a.scheduleId,a.inicio,a.fim,a.procedimento,
          JSON.stringify({scheduleId:a.scheduleId, procedureName:a.procedimento})]);
      if (r.rowCount !== 1) throw new Error('CONFLITO_DE_IDENTIDADE_AGENDAMENTO');
      await c.query('COMMIT');
    } catch (erro) {
      await c.query('ROLLBACK');
      throw erro;
    } finally { c.release(); }
  }
}
