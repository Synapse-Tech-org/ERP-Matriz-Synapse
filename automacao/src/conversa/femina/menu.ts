import type { ConteudoRecebido } from '../entrada.js';

// Identificadores sao contratos dos botoes. Os titulos e as mensagens vem do CRM.
const OPCOES_MENU = ['menu_ginecologia','menu_prenatal','menu_cirurgia','menu_retorno',
  'menu_outro','menu_documentos','menu_cancelar_agendamento','menu_remarcar_agendamento','menu_encerrar_atendimento'] as const;
type Opcao = typeof OPCOES_MENU[number];
type Jornada = Exclude<Opcao,'menu_encerrar_atendimento'>;
export type EstadoInicial = { etapa: 'menu_principal'; cpf: string | null } |
  { etapa: 'aguardar_cpf'; escolha: Jornada; cpf: string | null };

export function avancarCadastro(estado: EstadoInicial, entrada: ConteudoRecebido,
  titulos: Readonly<Record<Opcao,string>>) {
  const limpar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const cpfValido = (s: string) => /^\d{11}$/.test(s) && !/^(\d)\1+$/.test(s);
  if (estado.etapa === 'aguardar_cpf') {
    const cpf = entrada.tipo === 'texto' ? entrada.texto.replace(/[.\-\s]/g,'') : '';
    if (!cpfValido(cpf)) return {estado,acao:'solicitar_cpf',mensagemChave:'chatbot_cpf_solicitar'} as const;
    return { estado:{...estado,cpf}, acao:'consultar_paciente',cpf } as const;
  }
  // Texto digitado so seleciona um titulo inequivoco no menu atualmente exibido.
  const candidatos = OPCOES_MENU.filter(id => entrada.tipo === 'clique' ? id === entrada.opcaoId :
    entrada.tipo === 'texto' && titulos[id] && limpar(titulos[id]) === limpar(entrada.texto));
  const opcao = candidatos.length === 1 ? candidatos[0] : undefined;
  if (!opcao) return {estado,acao:'exibir_menu',mensagemChave:'chatbot_menu_principal',
    opcoes: OPCOES_MENU.map(id=>({id,titulo:titulos[id]}))} as const;
  if (opcao === 'menu_encerrar_atendimento') return {estado,acao:'encerrar_atendimento'} as const;
  const cpf = (estado.cpf ?? '').replace(/[.\-\s]/g,'');
  const novo: EstadoInicial = {etapa:'aguardar_cpf', escolha:opcao, cpf:cpfValido(cpf)?cpf:null};
  return novo.cpf ? {estado:novo,acao:'consultar_paciente',cpf:novo.cpf} as const :
    {estado:novo,acao:'solicitar_cpf',mensagemChave:'chatbot_cpf_solicitar'} as const;
}
