import type { Pool } from 'pg';

export class MemoriaAgente {
  constructor(private readonly banco: Pick<Pool,'query'>) {}

  async historico(sessao: string, limite: number) {
    if (!sessao || !Number.isSafeInteger(limite) || limite < 1 || limite > 1000) throw new Error('JANELA_MEMORIA_INVALIDA');
    const r = await this.banco.query<{ message: unknown }>(
      'SELECT message FROM (SELECT id,message FROM public.n8n_chat_histories WHERE session_id=$1 ORDER BY id DESC LIMIT $2) recentes ORDER BY id',
      [sessao, limite]);
    return r.rows.map(x => x.message);
  }

  async registrarTurno(sessao: string, pergunta: string, resposta: string) {
    if (!sessao) throw new Error('SESSAO_AUSENTE');
    // As duas mensagens sao atomicas e mantem o formato do historico do agente.
    await this.banco.query('INSERT INTO public.n8n_chat_histories(session_id,message) VALUES ($1,$2::jsonb),($1,$3::jsonb)',
      [sessao, JSON.stringify({ type: 'human', content: pergunta }), JSON.stringify({ type: 'ai', content: resposta })]);
  }

  async resetar(sessao: string) {
    if (!sessao) throw new Error('SESSAO_AUSENTE');
    await this.banco.query('DELETE FROM public.n8n_chat_histories WHERE session_id=$1', [sessao]);
  }
}
