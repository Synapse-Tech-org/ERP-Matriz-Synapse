import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {definirCredencialAutomacao} from './configuracao-credencial-automacao.mjs';

// Requer autorizacao especifica. Nao testa SQL, executa fluxos ou altera nodes.
// --apply permite somente cadastrar a credencial ausente no n8n de TESTE.
const here = path.dirname(fileURLToPath(import.meta.url));
const aplicar = process.argv.includes('--apply');
const env = parseEnv(fs.readFileSync(path.join(here, '../.env.example'), 'utf8'));
const definicao = definirCredencialAutomacao(env);
const token = fs.readFileSync(path.join(here, '../n8n-teste-api.md'), 'utf8').match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)?.[0];
if (!token) throw new Error('CHAVE_N8N_AUSENTE');
const base = 'https://n8n-teste.187.77.47.30.sslip.io/api/v1/credentials';
async function api(sufixo = '', method = 'GET', body) {
  if (method !== 'GET' && !(aplicar && method === 'POST' && sufixo === '')) throw new Error('OPERACAO_NAO_AUTORIZADA');
  const r = await fetch(base + sufixo, {method, redirect:'error',
    headers:{'X-N8N-API-KEY':token,'Content-Type':'application/json'},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(20000)});
  if (!r.ok) throw new Error('N8N_CREDENCIAL_HTTP_' + r.status);
  return r.json();
}
const encontradas = []; let cursor;
do {
  const r = await api('?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
  encontradas.push(...r.data.filter(c => c.type === 'postgres' && c.name === definicao.name));
  cursor = r.nextCursor;
} while (cursor);
if (encontradas.length > 1) throw new Error('CREDENCIAL_EXISTENTE_AMBIGUA');
if (encontradas.length) {
  console.log(JSON.stringify({id:encontradas[0].id, name:encontradas[0].name, criada:false, existentePreservada:true, conexaoTestada:false}));
} else if (!aplicar) {
  console.log(JSON.stringify({name:definicao.name, ausente:true, configuracaoValidada:true, modo:'somente-leitura'}));
} else {
  const criada = await api('', 'POST', definicao);
  if (!criada.id) throw new Error('CREDENCIAL_SEM_ID');
  console.log(JSON.stringify({id:criada.id, name:criada.name, criada:true, conexaoTestada:false, nodesAlterados:0}));
}
