import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';

// O cliente da origem so permite GET. Escritas ficam restritas ao host de teste.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const sourceRoot = path.resolve(repo, '../../Estrutural Vidros');
const SOURCE = 'https://n8n.187.77.47.30.sslip.io';
const TARGET = 'https://n8n-teste.187.77.47.30.sslip.io';
const CRM = 'https://crm-teste.187.77.47.30.sslip.io';
// Alias definido na rede privada de CADA filho, nao o backend publico da origem.
const CRM_INTERNAL = 'http://synapse-backend-internal:8080';
const EVO = 'https://evolution-hml.187.77.47.30.sslip.io';
const INSTANCE = 'instancia_numero_teste';
const PHONE = '556198897431';
const mode = process.argv[2] || 'prepare';
if (!['prepare', 'import'].includes(mode)) throw new Error('Use prepare ou import. Nenhum modo executa ou ativa fluxos.');
const env = parseEnv(fs.readFileSync(path.join(repo, 'automacao/.env.example'), 'utf8'));
const jwt = text => text.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)?.[0];
const sourceKey = jwt(fs.readFileSync(path.join(sourceRoot, 'CONTEXTO-E-DECISOES-ESTRUTURAL-VIDROS.md'), 'utf8'));
const targetKey = jwt(fs.readFileSync(path.join(repo, 'automacao/n8n-teste-api.md'), 'utf8'));
if (!sourceKey || !targetKey) throw new Error('Chave local ausente');
const statePath = path.join(here, '.import-state.json');
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { credentials: {}, workflows: {} };
const saveState = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
async function api(base, endpoint, method = 'GET', body) {
  if (base === SOURCE && method !== 'GET') throw new Error('ESCRITA_NA_ORIGEM_PROIBIDA');
  if (base !== SOURCE && base !== TARGET) throw new Error('HOST_NAO_AUTORIZADO');
  if (method !== 'GET' && mode !== 'import') throw new Error('MODO_SOMENTE_PREPARACAO');
  if (/activate|executions|run/.test(endpoint)) throw new Error('EXECUCAO_OU_ATIVACAO_PROIBIDA');
  const response = await fetch(base + '/api/v1' + endpoint, { method, redirect: 'error',
    headers: { 'X-N8N-API-KEY': base === SOURCE ? sourceKey : targetKey, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    // Nao imprimir corpo de erro: pode conter payload ou credenciais.
    throw new Error(`${method} ${endpoint.split('?')[0]} HTTP_${response.status}`);
  }
  return response.json();
}
async function list(endpoint) {
  let cursor; const result = [];
  do { const data = await api(endpoint === '/workflows-source' ? SOURCE : TARGET,
    (endpoint === '/workflows-source' ? '/workflows' : endpoint) + '?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    result.push(...(data.data || data)); cursor = data.nextCursor;
  } while (cursor);
  return result;
}
const credentialList = await list('/credentials');
const openai = credentialList.find(c => c.type === 'openAiApi' && c.name === 'OpenAI account');
const domains = host => ({ allowedHttpRequestDomains: 'domains', allowedDomains: new URL(host).hostname });
const header = (name, value, host) => ({ name, value, ...domains(host) });
const definitions = {
  crm: { name: 'HML CRM interno', type: 'httpHeaderAuth', data: { ...header('X-Synapse-Token', env.SYNAPSE_TOKEN_INTERNO, CRM), allowedDomains: new URL(CRM).hostname + ',synapse-backend-internal' } },
  evolution: { name: 'HML Evolution', type: 'httpHeaderAuth', data: header('apikey', env.EVOLUTION_API_KEY, EVO) },
  webhook: { name: 'HML Repasse CRM', type: 'httpHeaderAuth', data: header('X-Synapse-Webhook-Token', env.AUTOMACAO_WEBHOOK_REPASSE_TOKEN || env.AUTOMACAO_TOKEN, TARGET) },
  resumo: { name: 'HML Resumo entrada', type: 'httpHeaderAuth', data: header('CRM-Synapse-RES', env.AUTOMACAO_RESUMO_IA_TOKEN || env.AUTOMACAO_TOKEN, TARGET) },
  avaliacao: { name: 'HML Avaliacao entrada', type: 'httpHeaderAuth', data: header('CRM-Synapse-AVA', env.AUTOMACAO_AVALIACAO_TOKEN || env.AUTOMACAO_TOKEN, TARGET) },
  postgresCrm: { name: 'HML PostgreSQL CRM', type: 'postgres', data: { host: 'postgres', port: 5432, database: env.POSTGRES_DB, user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, ssl: 'disable', maxConnections: 3 } },
  postgresTecnico: { name: 'HML PostgreSQL tecnico - validar tabelas', type: 'postgres', data: { host: 'postgres', port: 5432, database: env.N8N_DB_NAME, user: env.N8N_DB_USER, password: env.N8N_DB_PASSWORD, ssl: 'disable', maxConnections: 3 } },
  redis: { name: 'HML Redis CRM', type: 'redis', data: { host: 'redis', port: 6379, database: 0, ssl: false } },
  jwtCrm: { name: 'HML CRM JWT - PENDENTE LOGIN', type: 'httpBearerAuth', data: { token: 'PENDENTE_LOGIN_CRM_HML', ...domains(CRM) } },
  login: { name: 'HML Login CRM - PREENCHER', type: 'httpCustomAuth', data: { json: JSON.stringify({ body: { email: 'PREENCHER_USUARIO_TECNICO_HML', senha: 'PREENCHER_SENHA_HML' } }), ...domains(CRM) } },
  n8n: { name: 'HML n8n API', type: 'n8nApi', data: { apiKey: targetKey, baseUrl: TARGET + '/api/v1', ...domains(TARGET) } },
};
const credentials = {};
for (const [key, definition] of Object.entries(definitions)) {
  let found = state.credentials[key] || credentialList.find(c => c.name === definition.name && c.type === definition.type);
  if (!found && mode === 'import') {
    found = await api(TARGET, '/credentials', 'POST', definition);
    state.credentials[key] = { id: found.id, name: found.name, type: definition.type }; saveState();
  }
  credentials[key] = { id: found?.id || `PENDENTE_${key}`, name: definition.name };
  if (key === 'crm' && found && mode === 'import' && state.credentials[key]) {
    await api(TARGET, '/credentials/' + found.id, 'PATCH', definition);
  }
}
if (openai) credentials.openai = { id: openai.id, name: openai.name };
const sourceCredentialMap = { 'IIaH5fQzMVf6Z48E': 'redis', ycdcpDIJknhhoBkI: 'postgresTecnico', cPdE5mzXoEaXsDF6: 'postgresCrm',
  '0U9D2DqWPeSRBCyF': 'crm', '8AGpG1BtIYtXOaHq': 'openai', '8NmYzL8Y0pVMIgdM': 'jwtCrm',
  oO7HfoRYsDPvYzTF: 'resumo', '0VDCn6Eory9N9lza': 'avaliacao', aZutmMvLmeWvZS4N: 'login', UAPILDccvUJxYCTw: 'n8n' };
const node = (name, type, parameters, x = 0, y = 0, extra = {}) => ({ id: randomUUID(), name, type: 'n8n-nodes-base.' + type,
  typeVersion: type === 'code' ? 2 : type === 'httpRequest' ? 4.2 : type === 'set' ? 3.4 : 1, position: [x,y], parameters, ...extra });
const edge = name => ({ node: name, type: 'main', index: 0 });
const assign = (name, value, type = 'string') => ({ id: randomUUID(), name, value, type });
const helper = { sourceId: '__evolution_sender', name: 'HML - Enviar pela Evolution', nodes: [
  node('Entrada', 'executeWorkflowTrigger', { inputSource: 'passthrough' }),
  node('Configuracao HML', 'set', { assignments: { assignments: [assign('evolution_base_url', EVO), assign('evolution_instancia', INSTANCE),
    assign('envios_habilitados', false, 'boolean'), assign('numeros_permitidos', env.WHATSAPP_NUMEROS_PERMITIDOS || '')] }, options: {} }, 220),
  node('Preparar Evolution', 'code', { jsCode: fs.readFileSync(path.join(here, 'templates/prepare-send.js'), 'utf8') }, 440),
  node('Enviar Evolution', 'httpRequest', { method: 'POST', url: "={{ $('Preparar Evolution').item.json.url }}", authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json', jsonBody: "={{ $('Preparar Evolution').item.json.body }}", options: { timeout: 20000 } }, 660, 0,
    { credentials: { httpHeaderAuth: credentials.evolution }, retryOnFail: false }),
  node('Compatibilizar comprovante', 'code', { jsCode: "// Preserva o formato que os subfluxos usam para registrar o identificador do envio.\nconst r = $('Enviar Evolution').item.json;\nif ($('Preparar Evolution').item.json.presenca) return [{json:{success:true,presenca:true}}];\nif (!r.key?.id || r.key.fromMe !== true) throw new Error('EVOLUTION_SEM_COMPROVANTE: nao reenviar automaticamente');\nreturn [{json:{...r,messages:[{id:r.key.id}],messageId:r.key.id}}];" }, 880)
], connections: { Entrada: { main: [[edge('Configuracao HML')]] }, 'Configuracao HML': { main: [[edge('Preparar Evolution')]] },
  'Preparar Evolution': { main: [[edge('Enviar Evolution')]] }, 'Enviar Evolution': { main: [[edge('Compatibilizar comprovante')]] } }, settings: { executionOrder: 'v1' } };

const sourceWorkflows = await list('/workflows-source');
const report = { preparedAt: new Date().toISOString(), target: TARGET, source: SOURCE, active: false,
  globalPending: ['LOGIN_CRM_HML', 'VALIDAR_TABELAS_TECNICAS_E_FAQ', 'CONFIGURAR_REPASSE_CRM_E_WEBHOOKS', 'ENVIOS_DESLIGADOS_NO_ADAPTADOR', 'VALIDAR_BOTOES_LISTAS_MIDIAS_SEM_EXECUCAO_AUTOMATICA'], workflows: [] };
const sensitive = /password|senha|secret|segredo|(^|_)token($|_)|api.?key/i;
const hosts = new Set();
function clean(value, key = '') {
  if (Array.isArray(value)) return value.map(x => clean(x, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,clean(v,k)]));
  if (typeof value !== 'string') return value;
  let result = value.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, 'PENDENTE_CREDENCIAL_HML');
  result = result.replace(/https?:\/\/(?:synapse-backend-internal(?::8080)?|crm\.187\.77\.47\.30\.sslip\.io|crm-estrutural[^/\s'"`]*)/g, CRM);
  result = result.replaceAll('https://n8n.187.77.47.30.sslip.io', TARGET);
  if (sensitive.test(key) && result && !result.startsWith('=')) return 'PENDENTE_CREDENCIAL_HML';
  return result;
}
function block(n, reason, pending) {
  pending.push(`${n.name}: ${reason}`);
  n.type = 'n8n-nodes-base.stopAndError'; n.typeVersion = 1;
  n.parameters = { errorMessage: 'HML_PENDENTE: ' + reason }; delete n.credentials;
  delete n.onError; delete n.continueOnFail; n.retryOnFail = false;
}
function executeAdapter(n, payload, recipient) {
  n.type = 'n8n-nodes-base.executeWorkflow'; n.typeVersion = 1.2;
  n.parameters = { workflowId: { __rl: true, mode: 'id', value: '__evolution_sender' },
    workflowInputs: { mappingMode: 'defineBelow', value: { payload, destinatario: recipient || '' }, schema: [
      { id: 'payload', displayName: 'payload', type: 'object', required: true }, { id: 'destinatario', displayName: 'destinatario', type: 'string' }], matchingColumns: [], attemptToConvertTypes: false, convertFieldsToString: false }, options: { waitForSubWorkflow: true } };
  delete n.credentials; n.retryOnFail = false; delete n.onError; delete n.continueOnFail;
}
const prepared = [helper];
for (const source of sourceWorkflows) {
  const draft = await api(SOURCE, '/workflows/' + source.id);
  const published = draft.active && draft.activeVersion?.nodes ? draft.activeVersion : draft;
  const w = { sourceId: source.id, name: 'HML - ' + source.name, nodes: clean(structuredClone(published.nodes)),
    connections: structuredClone(published.connections || {}), settings: { executionOrder: 'v1', timezone: env.SYNAPSE_TIMEZONE || 'America/Sao_Paulo' } };
  const pending = [];
  for (const n of w.nodes) {
    const oldCredentials = n.credentials || {};
    n.credentials = {};
    for (const [type,c] of Object.entries(oldCredentials)) {
      const target = credentials[sourceCredentialMap[c.id]];
      if (target) n.credentials[type] = target;
      else if (!['crypto','httpBearerAuth'].includes(type)) { pending.push(`${n.name}: CREDENCIAL_${type}_PENDENTE`); }
    }
    if (!Object.keys(n.credentials).length) delete n.credentials;
    const p = n.parameters;
    for (const a of p.assignments?.assignments || []) {
      if (a.name === 'crm_base_url') a.value = CRM;
      if (a.name === 'crm_base_interna') a.value = CRM_INTERNAL + '/internal/v1';
      if (a.name === 'n8n_base_url') a.value = TARGET;
      if (a.name === 'crm_jwt_credential_id') a.value = credentials.jwtCrm.id;
      if (a.name === 'crm_jwt_credential_name') a.value = credentials.jwtCrm.name;
      if (a.name === 'crm_jwt_allowed_domains') a.value = new URL(CRM).hostname;
      if (a.name === 'numero_destinatario_autorizado') a.value = PHONE;
      if (/phone_number_id/.test(a.name)) a.value = INSTANCE;
      if (a.name === 'timezone') a.value = env.SYNAPSE_TIMEZONE || 'America/Sao_Paulo';
      if (/meta_graph_base_url|uzapi_base_url/.test(a.name)) a.value = EVO;
      if (/meta_graph_version|uzapi_version/.test(a.name)) a.value = 'evolution';
      if (a.name === 'uzapi_username') a.value = INSTANCE;
      if (/redis_key_prefix|session_prefix/.test(a.name) && typeof a.value === 'string' && !a.value.startsWith('=')) a.value = 'hml:' + a.value;
      if (sensitive.test(a.name) && a.value && !String(a.value).startsWith('=')) a.value = 'PENDENTE_CREDENCIAL_HML';
      if (/lead_id_teste|atendente_outros_id/.test(a.name)) { a.value = ''; pending.push(`${n.name}: CONFIGURAR_${a.name}`); }
      if (/teste manual/i.test(n.name) && /telefone|phone|lead|atendimento/i.test(a.name)) { a.value = ''; pending.push(`${n.name}: CONFIGURAR_${a.name}_HML`); }
      if (/jev_url/.test(a.name)) a.value = '';
    }
    if (n.type === 'n8n-nodes-base.webhook') {
      p.path = 'hml/' + source.id + '/' + p.path;
      n.webhookId = randomUUID(); p.authentication = 'headerAuth'; p.options = { ...p.options, rawBody: false };
      n.credentials = { httpHeaderAuth: source.id === 'FNCKnkLKsvU2qMKL' ? credentials.webhook :
        source.name.startsWith('EV-05') ? credentials.resumo : credentials.avaliacao };
    }
    const meta = Object.values(oldCredentials).some(c => c.id === 'xIdAzVO8p3LjqOuG');
    if (n.type === 'n8n-nodes-base.httpRequest' && String(p.url).includes('/internal/v1')) {
      p.url = p.url.replaceAll(CRM, CRM_INTERNAL).replace(/\$\('[^']+'\)\.(?:first\(\)|item)\.json\.crm_base_url/g, JSON.stringify(CRM_INTERNAL));
    }
    if (n.type === 'n8n-nodes-base.httpRequest' && meta && !['Consultar URL da midia Meta','Baixar arquivo da Meta'].includes(n.name)) {
      if (!String(p.url).includes('/messages')) { block(n,'CHAMADA_META_NAO_MAPEADA',pending); continue; }
      if (source.name.startsWith('EV-07')) { block(n,'TEMPLATE_META_PRECISA_DE_CONTEUDO_EVOLUTION',pending); continue; }
      executeAdapter(n, p.jsonBody, "={{ $('When Executed by Another Workflow').first().json.evento?.wa_id || '' }}");
    } else if (n.type === 'n8n-nodes-base.httpRequest' && /JEV/.test(n.name)) block(n,'JEV_HML_NAO_CONFIGURADO',pending);
    else if (n.name === 'Buscar foto UZAPI') {
      n.parameters = { method: 'POST', url: EVO + '/chat/fetchProfilePictureUrl/' + INSTANCE,
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
        jsonBody: "={{ {number: $('Preparar lead para foto').item.json.phone} }}", options: { timeout: 15000 } };
      n.credentials = { httpHeaderAuth: credentials.evolution }; n.retryOnFail = false;
    } else if (n.name === 'Extrair URL da foto') p.jsCode = p.jsCode.replace('dadosFoto.url,','resposta.profilePictureUrl,\n  dadosFoto.url,');
    else if (n.name === 'Consultar URL da midia Meta') {
      n.parameters = { method: 'POST', url: EVO + '/chat/getBase64FromMediaMessage/' + INSTANCE,
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
        jsonBody: "={{ {message:{key:{id:$('Preparar entrada midia').first().json.media_id}},convertToMp4:false} }}", options: { timeout: 20000 } };
      n.credentials = { httpHeaderAuth: credentials.evolution };
    } else if (n.name === 'Baixar arquivo da Meta') {
      n.type = 'n8n-nodes-base.convertToFile'; n.typeVersion = 1.1;
      n.parameters = { operation: 'toBinary', sourceProperty: 'base64', binaryPropertyName: 'data', options: {
        fileName: "={{ $('Preparar entrada midia').first().json.media.filename || 'arquivo' }}",
        mimeType: "={{ $('Consultar URL da midia Meta').first().json.mimetype || $('Preparar entrada midia').first().json.media.mime_type }}" } }; delete n.credentials;
    }
    if (n.type === 'n8n-nodes-base.httpRequest' && !n.credentials && p.authentication) block(n,'AUTENTICACAO_NAO_MAPEADA',pending);
  }
  if (source.name.startsWith('EV-00')) {
    const start = w.nodes.find(n => n.name === 'Receber evento');
    const normalizeName = 'Normalizar Evolution para contrato legado';
    // Mantemos o contrato interno para nao reescrever os orquestradores nesta copia.
    for (const n of w.nodes) n.parameters = JSON.parse(JSON.stringify(n.parameters).replaceAll("$('Receber evento')", `$('${normalizeName}')`));
    const normalizer = node(normalizeName,'code',{jsCode:fs.readFileSync(path.join(here,'templates/normalize-incoming.js'),'utf8')},start.position[0]+180,start.position[1]);
    const old = w.connections[start.name]; w.connections[start.name] = {main:[[edge(normalizeName)]]}; w.connections[normalizeName] = old;
    w.nodes.push(normalizer);
    const crypto = w.nodes.find(n => n.name === 'Calcular HMAC do corpo bruto');
    if (crypto) { crypto.type='n8n-nodes-base.noOp';crypto.typeVersion=1;crypto.parameters={};delete crypto.credentials; }
    const validate = w.nodes.find(n => n.name === 'Validar assinatura da Meta');
    if (validate) validate.parameters = {jsCode:`// Header Auth foi validado no Webhook. Subfluxo so aceita o normalizador local.\nreturn [{json:{assinatura_valida: $('${normalizeName}').first().json.hml_evolution_validado === true}}];`};
    const forward = w.nodes.find(n => n.name === 'webhook teste');
    if (forward) forward.parameters.workflowInputs = { mappingMode: 'defineBelow', value: {
      body: "={{ $('Receber evento').first().json.body }}", headers: "={{ $('Receber evento').first().json.headers }}" },
      schema: [{id:'body',displayName:'body',type:'object'}, {id:'headers',displayName:'headers',type:'object'}], matchingColumns: [], convertFieldsToString: false };
  }
  const annotation = node('Notas da copia HML','stickyNote',{content:'## Homologacao - nao ativar sem revisar\nCopia de '+source.name+'\nCRM de teste / Evolution.\n'+
    (pending.length ? pending.map(x=>'- '+x).join('\n') : 'Ver pendencias gerais no manifesto local.')+'\nCredenciais PostgreSQL dependem das tabelas tecnicas ainda nao validadas.',width:650,height:350},-600,-400);
  w.nodes.push(annotation);
  // Remove segredos literais que eventualmente vieram em headers/sets antigos.
  for (const n of w.nodes) {
    for (const h of n.parameters.headerParameters?.parameters || []) {
      if (/authorization|api.?key|token/i.test(h.name) && !String(h.value).startsWith('=')) h.value = 'PENDENTE_CREDENCIAL_HML';
    }
  }
  prepared.push(w); report.workflows.push({sourceId:source.id,name:w.name,pending});
}

// Substitui apenas referencias conhecidas, nunca IDs de leads ou de mensagens.
function remapWorkflow(w, mapping) {
  const copy = structuredClone(w);
  for (const n of copy.nodes) {
    const p=n.parameters;
    if (n.type.includes('executeWorkflow') || n.type.includes('toolWorkflow')) {
      const id=typeof p.workflowId==='string'?p.workflowId:p.workflowId?.value;
      if(id && mapping[id]) p.workflowId={__rl:true,mode:'id',value:mapping[id]};
      else if(id && !String(id).startsWith('=')) throw new Error('SUBFLUXO_NAO_MAPEADO: '+id);
    }
  }
  delete copy.sourceId; return copy;
}
const output=path.join(here,'fluxos'); fs.mkdirSync(output,{recursive:true});
function writeExports(mapping) {
  for(const w of prepared){const final=remapWorkflow(w,mapping);final.active=false;
    fs.writeFileSync(path.join(output,w.sourceId+'.json'),JSON.stringify(final,null,2)+'\n');}
  fs.writeFileSync(path.join(here,'manifesto.json'),JSON.stringify(report,null,2)+'\n');
}
const provisional=Object.fromEntries(prepared.map(w=>[w.sourceId,'PENDENTE_IMPORT_'+w.sourceId]));
writeExports(provisional);
if(mode==='import') {
  const existing=await list('/workflows');
  for(const w of prepared){
    if(!state.workflows[w.sourceId]){
      if(existing.some(x=>x.name===w.name))throw new Error('FLUXO_EXISTENTE_NAO_GERENCIADO: '+w.name);
      const initial=remapWorkflow(w,provisional);
      const created=await api(TARGET,'/workflows','POST',initial);
      if(created.active)throw new Error('FLUXO_CRIADO_ATIVO_INESPERADAMENTE');
      state.workflows[w.sourceId]=created.id;saveState();
      console.log('Criado desativado: '+w.name);
    }
  }
  for(const w of prepared){
    const id=state.workflows[w.sourceId];const current=await api(TARGET,'/workflows/'+id);
    if(current.active)throw new Error('NAO_ALTERAR_FLUXO_ATIVADO_PELO_USUARIO: '+id);
    await api(TARGET,'/workflows/'+id,'PUT',remapWorkflow(w,state.workflows));
  }
  for(const row of report.workflows)row.targetId=state.workflows[row.sourceId];
  report.helperId=state.workflows.__evolution_sender;
  writeExports(state.workflows);
  const remote=await list('/workflows');
  const managed=remote.filter(w=>Object.values(state.workflows).includes(w.id));
  if(managed.length!==prepared.length || managed.some(w=>w.active))throw new Error('VERIFICACAO_FINAL_FALHOU');
  console.log(JSON.stringify({imported:managed.length,active:0,pending:report.workflows.filter(w=>w.pending.length).length}));
}else console.log(JSON.stringify({prepared:prepared.length,remoteWrites:0}));
