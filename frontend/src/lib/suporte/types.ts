export type StatusLembrete = "PENDENTE" | "CONCLUIDO";

export interface Lembrete {
  id: string;
  leadId: string;
  leadNome: string | null;
  atendenteId: string;
  atendenteNome: string;
  texto: string;
  dataHora: string;
  origemAutomatica: boolean;
  status: StatusLembrete;
}

export interface PaginaLembretes {
  lembretes: Lembrete[];
  resumo?: { pendentes: number; hoje: number; semana: number; automaticos: number };
  pagina: number;
  temMais: boolean;
}

export interface DadosLembrete {
  leadId: string | null;
  texto: string;
  dataHora: string;
}

export type StatusMensagemProgramada = "AGENDADA" | "ENVIADA" | "CANCELADA";
export interface MensagemProgramada {
  id: string; leadId: string; leadNome: string; atendenteId: string; atendenteNome: string;
  conteudo: string; dataEnvio: string; status: StatusMensagemProgramada;
}
export interface PaginaMensagensProgramadas {
  mensagens: MensagemProgramada[];
  pagina: number;
  temMais: boolean;
  resumo?: { agendadas: number; enviadas: number; canceladas: number; total: number };
}
export interface DadosMensagemProgramada { leadId: string; conteudo: string; dataEnvio: string; }

export interface MensagemRapida { geral?:boolean; id:string; atendenteId:string; atendenteNome:string; palavraChave:string; conteudo:string; tipoMidia:string|null; }
export interface DadosMensagemRapida { geral?:boolean; palavraChave:string; conteudo:string; }
