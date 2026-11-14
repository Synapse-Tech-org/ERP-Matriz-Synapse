export interface RegraFollowup {
  id: string;
  nome: string;
  tempoMinutos: number;
  texto: string;
}
export interface Botao {
  id: string;
  titulo: string;
}
export interface RegrasDaRodada {
  regras: RegraFollowup[];
  limiteEnvios: number;
  encerrarAposMinutos: number;
  janelaLivreMinutos: number;
  exigeJanela: boolean;
  botoes: Botao[];
  padroesUtilizados: string[];
  leadTeste?: string;
}
export interface Mensagem {
  id: string;
  em: string;
  remetente: string;
  texto: string;
  status: string;
}
export interface AtendimentoFollowup {
  id: string;
  leadId: string;
  nome: string;
  telefone: string;
  status: string;
  ultima: Mensagem | null;
  ultimaDoLead: Mensagem | null;
}
export interface EnvioRegistrado {
  id: string;
  regraId: string;
  ciclo: string;
  status: string;
  texto: string;
  enviadoEm: string | null;
  encerradoEm: string | null;
  crmMensagemId: string | null;
}
export type DecisaoFollowup =
  | { acao: "IGNORAR"; motivo: string }
  | { acao: "ENVIAR"; regra: RegraFollowup; texto: string; ciclo: string }
  | { acao: "ENCERRAR"; envio: EnvioRegistrado };

// Portas: o caso de uso conhece as capacidades, nao HTTP, SQL ou SDK.
export interface ConsultaAtendimentos {
  listar(
    apos: string | null,
    limite: number,
    ate: string,
  ): Promise<AtendimentoFollowup[]>;
  obter(id: string): Promise<AtendimentoFollowup | null>;
  ultimoId(): Promise<string | null>;
}
export interface CrmFollowup {
  configuracao(): Promise<RegrasDaRodada>;
  reservar(
    leadId: string,
    regraId: string,
    ciclo: string,
    chave: string,
    execucao: string,
  ): Promise<{ podeEnviar: boolean; motivo: string }>;
  registrar(envio: ComprovanteEnvio): Promise<string>;
  finalizar(atendimentoId: string, chave: string): Promise<void>;
}
export interface PedidoMensagem {
  telefone: string;
  texto: string;
  botoes: Botao[];
}
export interface ProvedorFollowup {
  validar(pedido: PedidoMensagem): void;
  enviar(pedido: PedidoMensagem): Promise<string>;
}
export interface ComprovanteEnvio {
  id: string;
  atendimentoId: string;
  regraId: string;
  chave: string;
  execucaoId: string;
  texto: string;
  botoes: Botao[];
  provedorId: string;
}
export interface ControleFollowup {
  recusou(leadId: string): Promise<boolean>;
  envios(atendimentoId: string): Promise<EnvioRegistrado[]>;
  reservar(
    atendimento: AtendimentoFollowup,
    decisao: Extract<DecisaoFollowup, { acao: "ENVIAR" }>,
    botoes: Botao[],
    rodadaId: string,
  ): Promise<{ id: string; chave: string } | null>;
  marcar(id: string, status: string, motivo?: string): Promise<void>;
  consumirLimite(rodadaId: string, limite: number): Promise<boolean>;
  liberarLimite(rodadaId: string): Promise<void>;
  comprovar(id: string, provedorId: string): Promise<ComprovanteEnvio>;
  registrado(id: string, mensagemId: string): Promise<void>;
  encerrado(id: string): Promise<void>;
  pendentes(limite: number): Promise<ComprovanteEnvio[]>;
}
