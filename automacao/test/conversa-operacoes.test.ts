import assert from 'node:assert/strict';
import test from 'node:test';
import { SessaoTecnica } from '../src/conversa/crm/sessao.js';
import { ConsultaAtendimento } from '../src/conversa/crm/atendimento.js';
import { AgendaDarwin } from '../src/conversa/femina/darwin.js';
import { decidirAvaliacao } from '../src/conversa/agente/avaliacao.js';

test('renovacao do login e compartilhada por chamadas concorrentes e respeita a validade',async()=>{
  let agora=0, chamadas=0;
  const s=new SessaoTecnica('https://crm',{email:'teste',senha:'teste'},{
    chamar:async()=>({accessToken:String(++chamadas),expiraEmSegundos:60})},()=>agora);
  assert.deepEqual(await Promise.all([s.obter(),s.obter()]),['1','1']);
  agora=60000;
  assert.equal(await s.obter(),'2');
});

test('resolver atendimento usa telefone completo, variante brasileira e identidade do cartao',async()=>{
  const tentativas: unknown[]=[];
  const c=new ConsultaAtendimento('https://crm',{obter:async()=>'teste'},{chamar:async(url,h,b)=>{
    tentativas.push(b);
    if (url.includes('/busca')) return {atendimentoId:'a',leadId:'outro',modo:'IA'};
    return tentativas.length===1?[]:[{id:'lead',telefone:'556196791022'}];
  }},20);
  await assert.rejects(c.resolver('556196791022'),/OUTRO_LEAD/);
  assert.match(JSON.stringify(tentativas[0]),/5561996791022/);
  assert.equal(tentativas.length,3);
});

test('Darwin nao escreve quando o slot nao pertence ao profissional da escolha',async()=>{
  const metodos:string[]=[];
  const agenda=new AgendaDarwin(async(m)=>{metodos.push(m);return {professionalId:'outro',timetableId:'g',availableTimes:['09:00']};});
  await assert.rejects(agenda.remarcar('ag',{data:'2027-05-20',inicio:'09:00',fim:'09:15',grade:'g',profissional:'p'},
    new Date('2027-05-20T12:00Z'),new Date('2027-05-01')),/INDISPONIVEL/);
  assert.deepEqual(metodos,['GET']);
});

test('Darwin diferencia confirmacao, cancelamento e falha de negocio mesmo com HTTP 200',async()=>{
  const chamadas:unknown[]=[];
  const agenda=new AgendaDarwin(async(...args)=>{chamadas.push(args);return {success:args[0]==='PUT'};});
  await agenda.confirmar('id');
  await assert.rejects(agenda.cancelar('id'),/RECUSOU/);
  assert.deepEqual(chamadas,[['PUT','/api/schedules/update',{corpo:{scheduleId:'id',status:'Confirmado'}}],
    ['DELETE','/api/schedules/delete',{consulta:{scheduleId:'id'}}]]);
});

test('nota vem do ID pendente e nunca de um clique em outra pergunta',()=>{
  const m={provedor:'meta',instancia:'hml',telefone:'5511999990000',mensagemId:'m',mensagemRespondidaId:'q',
    conteudo:{tipo:'clique' as const,origem:'botao' as const,opcaoId:'bom',rotulo:'Outra coisa'}};
  const p={telefone:m.telefone,atendimentoId:'a',atendenteId:'b',mensagemOriginalId:'q',opcoes:[{id:'bom',nota:4,comentario:'Bom'}]};
  assert.equal(decidirAvaliacao(m,p).tipo,'registrar_nota');
  assert.equal(decidirAvaliacao({...m,mensagemRespondidaId:'antiga'},p).tipo,'nao_aplicavel');
  assert.equal(decidirAvaliacao({...m,conteudo:{tipo:'texto',texto:'4'}},p).tipo,'encerrar_sem_nota');
});
