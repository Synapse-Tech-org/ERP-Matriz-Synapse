import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {aplicarMigracoes} from '../dist/src/operacao/migracoes.js';

// Este teste e chamado somente dentro do container isolado de banco-integracao.sh.
// Nunca carrega .env nem credenciais da homologacao/producao.
if (process.env.AUTOMACAO_TESTE_ISOLADO !== 'true') throw new Error('EXECUTAR_PELO_TESTE_DOCKER_ISOLADO');
const pool = new Pool({host:'127.0.0.1', port:5432, database:'automacao_fixture',
  user:'automacao_fixture_app', password:'senha_destino_de_teste', max:1, connectionTimeoutMillis:3000});
try {
  await aplicarMigracoes(pool);
  const historico = await pool.query('SELECT versao FROM automacao_infra.migracao ORDER BY versao');
  assert.deepEqual(historico.rows.map(r => r.versao), [1, 2]);
  const colunas = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='faq' ORDER BY ordinal_position");
  assert.deepEqual(colunas.rows, [
    {column_name:'id',data_type:'integer',is_nullable:'NO'},
    {column_name:'nome',data_type:'text',is_nullable:'NO'},
    {column_name:'pergunta',data_type:'text',is_nullable:'NO'},
    {column_name:'resposta',data_type:'text',is_nullable:'NO'},
  ]);
  assert.equal(Number((await pool.query('SELECT count(*) AS total FROM public.faq')).rows[0].total), 0);
  await pool.query('INSERT INTO public.faq (nome, pergunta, resposta) VALUES ($1,$2,$3)', ['fixture','Pergunta de teste','Resposta de teste']);
  await aplicarMigracoes(pool);
  assert.equal(Number((await pool.query('SELECT count(*) AS total FROM public.faq')).rows[0].total), 1);
  await assert.rejects(pool.query("INSERT INTO public.faq (nome,pergunta,resposta) VALUES ('fixture','outra','outra')"), e => e.code === '23505');
  await assert.rejects(pool.query("INSERT INTO public.faq (nome,pergunta,resposta) VALUES ('sem_pergunta',NULL,'teste')"), e => e.code === '23502');
  console.log('OK: V1/V2 aplicadas, FAQ vazia, repeticao preserva dados e restricoes validas');
} finally { await pool.end(); }
