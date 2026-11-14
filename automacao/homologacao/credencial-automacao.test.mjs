import test from 'node:test';
import assert from 'node:assert/strict';
import {definirCredencialAutomacao} from './configuracao-credencial-automacao.mjs';

const env = {AUTOMACAO_DB_NAME:'automacao_fixture', AUTOMACAO_DB_USER:'automacao_fixture_app',
  AUTOMACAO_DB_PASSWORD:'senha-somente-de-teste', POSTGRES_DB:'crm_fixture', POSTGRES_USER:'crm_app',
  N8N_DB_NAME:'n8n_fixture', N8N_DB_USER:'n8n_app'};

test('usa somente o destino da automacao e preserva senha sem normalizar', () => {
  const c=definirCredencialAutomacao({...env,AUTOMACAO_DB_PASSWORD:' senha com espacos '});
  assert.equal(c.name,'HML PostgreSQL Automacao');assert.equal(c.type,'postgres');
  assert.equal(c.data.database,env.AUTOMACAO_DB_NAME);assert.equal(c.data.user,env.AUTOMACAO_DB_USER);
  assert.equal(c.data.password,' senha com espacos ');assert.equal(c.data.host,'postgres');assert.equal(c.data.maxConnections,3);
});

test('recusa CRM, n8n, bancos de sistema e usuarios compartilhados', () => {
  for (const database of [env.POSTGRES_DB,env.N8N_DB_NAME,'postgres','template0','template1']) {
    assert.throws(()=>definirCredencialAutomacao({...env,AUTOMACAO_DB_NAME:database}),/PROTEGIDO/);
  }
  for (const user of [env.POSTGRES_USER,env.N8N_DB_USER]) {
    assert.throws(()=>definirCredencialAutomacao({...env,AUTOMACAO_DB_USER:user}),/EXCLUSIVO/);
  }
});

test('recusa configuracao incompleta e porta invalida', () => {
  for (const key of ['AUTOMACAO_DB_NAME','AUTOMACAO_DB_USER','AUTOMACAO_DB_PASSWORD','POSTGRES_DB','N8N_DB_NAME']) {
    assert.throws(()=>definirCredencialAutomacao({...env,[key]:''}),/AUSENTE/);
  }
  assert.throws(()=>definirCredencialAutomacao({...env,AUTOMACAO_DB_PORT:'70000'}),/PORTA_INVALIDA/);
  assert.throws(()=>definirCredencialAutomacao({...env,AUTOMACAO_DB_NAME:'outro;DROP'}),/IDENTIFICADOR_INVALIDO/);
});
