import test from 'node:test';
import assert from 'node:assert/strict';
import { avancarCadastro } from '../src/conversa/femina/menu.js';
import { ModeloDeAtendimento } from '../src/conversa/agente/modelo.js';
import { AgendaDarwin } from '../src/conversa/femina/darwin.js';

const titulos = {menu_ginecologia:'Consulta',menu_prenatal:'Pre-natal',menu_cirurgia:'Cirurgia',
  menu_retorno:'Retorno',menu_outro:'Outros',menu_documentos:'Documentos',menu_cancelar_agendamento:'Cancelar',
  menu_remarcar_agendamento:'Remarcar',menu_encerrar_atendimento:'Encerrar'};

test('menu enxuto inicia cadastro para cirurgia e encerra sem solicitar CPF',()=>{
  const estado = {etapa:'menu_principal' as const,cpf:null};
  const cirurgia = avancarCadastro(estado,{tipo:'texto',texto:'cirurgia'},titulos);
  assert.equal(cirurgia.acao,'solicitar_cpf');
  assert.equal(avancarCadastro(cirurgia.estado,{tipo:'texto',texto:'00000000000'},titulos).acao,'solicitar_cpf');
  assert.equal(avancarCadastro(cirurgia.estado,{tipo:'texto',texto:'12345678901'},titulos).acao,'consultar_paciente');
  assert.equal(avancarCadastro(estado,{tipo:'clique',origem:'lista',rotulo:'Sair',opcaoId:'menu_encerrar_atendimento'},titulos).acao,'encerrar_atendimento');
});

test('agente institucional usa o modelo escolhido e nao injeta a equipe nem papeis de sistema vindos da memoria',async()=>{
  const chamadas: unknown[]=[];
  const modelo=new ModeloDeAtendimento({chamar:async(url,h,b)=>{
    chamadas.push(b);
    return {choices:[{finish_reason:'stop',message:{content:chamadas.length===1?'DUVIDA_INSTITUCIONAL':'Resposta'}}]};
  }},'https://modelo','teste');
  const r=await modelo.responder({modeloRouter:'router',modeloInstitucional:'faq',modeloTriagem:'triagem',
    global:'geral',router:'classifique',institucional:'responda',triagem:'acolha',
    contexto:'Equipe: {{equipe}}',contextoInstitucional:'FAQ: {{faq}}'},'Horario?',
    [{type:'system',content:'nao incluir'}],{faq:[{pergunta:'Horario?',resposta:'8h'}],equipe:['nao incluir']});
  assert.equal(r.texto,'Resposta');
  assert.match(JSON.stringify(chamadas[1]),/8h/);
  assert.doesNotMatch(JSON.stringify(chamadas[1]),/nao incluir/);
});

test('criacao Darwin sem ID consulta o mesmo paciente e nao repete a escrita',async()=>{
  const operacoes:string[]=[];
  const a=new AgendaDarwin(async(m,path)=>{
    operacoes.push(m+' '+path);
    if(path.includes('insurances'))return [{insuranceId:'i',name:'Plano'}];
    if(path.includes('procedures'))return [{procedureId:'p',name:'Consulta'}];
    if(path.includes('available'))return [{timetableId:'g',availableTimes:['10:00']}];
    if(path.endsWith('create'))return {message:'ok'};
    return [{scheduleId:'novo',date:'2027-05-21',time:'10:00',timetableId:'g'}];
  });
  assert.equal(await a.agendarPacienteIdentificado({grade:'g',profissional:'prof',data:'2027-05-21',inicio:'10:00',fim:'10:15'},
    '12345678901','plano','consulta',''),'novo');
  assert.equal(operacoes.filter(x=>x.startsWith('POST')).length,1);
});
