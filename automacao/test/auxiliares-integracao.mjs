import assert from 'node:assert/strict';

// Contrato da origem. Executado somente pelo fixture PostgreSQL isolado.
export async function verificarAuxiliares(pool) {
  const tabelas = {
    n8n_chat_histories: ['id','session_id','message','created_at'],
    follow_ups_temporary: ['id','follow_up_config_id','clinica_id','paciente_id','lead_id','titulo','descricao','scheduled_at','crm_atendimento_id','crm_paciente_id','regra_followup_nome','lead_ultima_mensagem_em','lead_ultima_mensagem_chave','ultima_mensagem_base_em','mensagem_enviada','whatsapp_message_id','crm_mensagem_id','status','enviado_em','encerrado_em','motivo_encerramento','created_at','updated_at'],
    follow_up_opt_outs: ['lead_id','wa_id','atendimento_id','recusado_em','origem','updated_at'],
    ev05_solicitacoes_automacao: ['solicitacao_id','lead_id','atendimento_id','execucao_id','estado','criado_em','atualizado_em'],
    ev07_envios_automaticos: ['id','categoria','referencia_id','lead_id','ciclo_chave','telefone','texto_enviado','payload_meta','status','execucao_n8n_id','meta_message_id','reservado_em','enviado_em','updated_at'],
    ev17_segmentacoes: ['atendimento_id','mensagem_ia_id','mensagem_ia_em','lead_id','execucao_id','estado','etapa_id','chave_crm','modelo','confianca','http_status','input_tokens','output_tokens','criado_em','atualizado_em'],
    ev17_cursores: ['chave','ultimo_atendimento_id','atualizado_em'],
  };
  for (const [tabela, colunas] of Object.entries(tabelas)) {
    const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [tabela]);
    const extensao = tabela === 'follow_ups_temporary' ? ['executor','chave_envio','execucao_id','botoes','motivo_operacional'] : [];
    assert.deepEqual(r.rows.map(c=>c.column_name), [...colunas, ...extensao], tabela);
    assert.equal(Number((await pool.query(`SELECT count(*) AS total FROM public.${tabela}`)).rows[0].total), 0, tabela);
  }
  const memoria = await pool.query("INSERT INTO public.n8n_chat_histories (session_id,message,created_at) VALUES ($1,$2,NULL) RETURNING id,message", ['sessao-fixture',{type:'human',data:{content:'fixture'}}]);
  assert.equal(typeof memoria.rows[0].id, 'number');
  assert.equal(memoria.rows[0].message.type, 'human');
  await assert.rejects(pool.query("INSERT INTO public.n8n_chat_histories (session_id,message) VALUES (NULL,'{}')"), e=>e.code==='23502');
  await assert.rejects(pool.query("INSERT INTO public.n8n_chat_histories (session_id,message) VALUES (repeat('a',256),'{}')"), e=>e.code==='22001');

  const followup = await pool.query("INSERT INTO public.follow_ups_temporary (crm_atendimento_id,follow_up_config_id) VALUES ('atendimento-fixture','regra-fixture') RETURNING clinica_id,titulo,status,lead_ultima_mensagem_chave");
  assert.deepEqual(followup.rows[0], {clinica_id:1,titulo:'Follow-up de atendimento',status:'ENVIADO',lead_ultima_mensagem_chave:'SEM_RESPOSTA_LEAD'});
  await assert.rejects(pool.query("INSERT INTO public.follow_ups_temporary (crm_atendimento_id,follow_up_config_id) VALUES ('atendimento-fixture','regra-fixture')"), e=>e.code==='23505');
  await pool.query("INSERT INTO public.follow_ups_temporary (crm_atendimento_id,follow_up_config_id,lead_ultima_mensagem_chave) VALUES ('atendimento-fixture','regra-fixture','novo-ciclo')");
  const recusa = await pool.query("INSERT INTO public.follow_up_opt_outs (lead_id) VALUES ('lead-fixture') RETURNING origem");
  assert.equal(recusa.rows[0].origem,'BOTAO_NAO');
  await assert.rejects(pool.query("INSERT INTO public.follow_up_opt_outs (lead_id) VALUES ('lead-fixture')"), e=>e.code==='23505');

  const uuid = '00000000-0000-4000-8000-000000000001';
  const solicitacao = await pool.query('INSERT INTO public.ev05_solicitacoes_automacao (solicitacao_id,lead_id,atendimento_id,execucao_id) VALUES ($1,$1,$1,$2) RETURNING estado', [uuid,'fixture']);
  assert.equal(solicitacao.rows[0].estado,'PENDENTE');
  const envioSql = "INSERT INTO public.ev07_envios_automaticos (categoria,referencia_id,lead_id,ciclo_chave,telefone,texto_enviado,payload_meta) VALUES ('fixture','fixture','fixture','fixture','000','fixture','{}') RETURNING status";
  assert.equal((await pool.query(envioSql)).rows[0].status,'RESERVADO');
  await assert.rejects(pool.query(envioSql),e=>e.code==='23505');
  const segmentacaoSql = 'INSERT INTO public.ev17_segmentacoes (atendimento_id,mensagem_ia_id,mensagem_ia_em,lead_id,execucao_id) VALUES ($1,$1,$2,$1,$3) RETURNING estado';
  const parametros = [uuid,'2026-01-01T00:00:00Z','fixture'];
  assert.equal((await pool.query(segmentacaoSql,parametros)).rows[0].estado,'RESERVADO');
  await assert.rejects(pool.query(segmentacaoSql,parametros),e=>e.code==='23505');
  assert.equal((await pool.query("INSERT INTO public.ev17_cursores (chave) VALUES ('fixture') RETURNING ultimo_atendimento_id")).rows[0].ultimo_atendimento_id,'');
  return async () => {
    for (const tabela of Object.keys(tabelas)) {
      assert.ok(Number((await pool.query(`SELECT count(*) AS total FROM public.${tabela}`)).rows[0].total)>0, 'Reaplicacao apagou '+tabela);
    }
  };
}
