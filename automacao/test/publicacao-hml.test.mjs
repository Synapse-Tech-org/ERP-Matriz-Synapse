import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {parse} from 'yaml';

const fonte=readFileSync(new URL('../../.github/workflows/ci.yml',import.meta.url),'utf8');
const workflow=parse(fonte);
const job=workflow.jobs.imagem_automacao_hml;
test('publicacao isolada exige branch de teste, nao roda em PR ou main',()=>{
  assert.match(job.if,/github\.ref == 'refs\/heads\/feat\/automacao-local-base'/);
  assert.match(job.if,/github\.event_name == 'push'/);
  assert.match(job.if,/inputs\.publicar_automacao_hml/);
  assert.doesNotMatch(job.if,/pull_request|refs\/heads\/main/);
  assert.equal(workflow.on.workflow_dispatch.inputs.publicar_automacao_hml.default,false);
});
test('publicacao espera testes da automacao e infra e nao publica CRM',()=>{
  assert.deepEqual(job.needs,['automacao','infra']);
  assert.deepEqual(job.permissions,{contents:'read',packages:'write'});
  assert.equal(job.strategy,undefined);
  const build=job.steps.find(s=>s.uses==='docker/build-push-action@v6');
  assert.equal(build.with.file,'automacao/Dockerfile');
  assert.equal(build.with.push,true);
  assert.doesNotMatch(JSON.stringify(job),/backend\/Dockerfile|frontend\/Dockerfile|docker stack deploy|ssh |dokploy\.deploy/);
});
test('usa namespace do repositorio atual, tag do commit e entrega digest sem alterar tag do CRM',()=>{
  const referencia=job.steps.find(s=>s.id==='referencia');
  assert.match(referencia.run,/GITHUB_REPOSITORY_OWNER,,/);
  assert.match(referencia.run,/hml-\$GITHUB_SHA/);
  const resumo=job.steps.find(s=>s.env?.DIGEST);
  assert.match(resumo.run,/AUTOMACAO_IMAGE_REPOSITORIO/);
  assert.match(resumo.run,/AUTOMACAO_IMAGE_DIGEST=@/);
  assert.match(resumo.run,/sha256:/);
  assert.doesNotMatch(resumo.run,/SYNAPSE_IMAGE_TAG=/);
  assert.ok(job.steps.some(s=>s.uses==='actions/upload-artifact@v4'&&s.with.name==='automacao-hml-imagem'));
});
test('publicacao geral do CRM mantem gatilhos e dependencias anteriores',()=>{
  const imagens=workflow.jobs.imagens;
  assert.match(imagens.if,/workflow_dispatch' && inputs.publicar_imagens/);
  assert.match(imagens.if,/refs\/heads\/main/);
  assert.match(imagens.if,/startsWith\(github.ref, 'refs\/heads\/codex\/'\)/);
  assert.doesNotMatch(imagens.if,/pull_request/);
  const tags=imagens.steps.find(s=>s.id==='metadata').with.tags;
  assert.match(tags,/value=latest,enable=.*refs\/heads\/main/);
  assert.match(tags,/prefix=br-,enable=.*!.*refs\/heads\/main/);
  assert.deepEqual(workflow.jobs.imagens.needs,['backend','frontend','infra','automacao']);
  assert.deepEqual(workflow.jobs.imagens.strategy.matrix.include.map(s=>s.nome),['backend','frontend','automacao']);
});
