export type EstadoBanco =
  | "PRONTO"
  | "BANCO_NAO_CONFIGURADO"
  | "BANCO_INDISPONIVEL"
  | "ESTRUTURA_INCOMPATIVEL";
export interface ExecucaoResumo {
  id: string;
  fluxoId: string | null;
  fluxoNome: string | null;
  status: string;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  modo: string | null;
}
export interface EtapaExecucao {
  nome: string;
  status: "sucesso" | "erro";
  duracaoMs: number;
  tentativas: number;
}
export interface DetalheExecucao extends ExecucaoResumo {
  etapas: EtapaExecucao[];
  detalhesDisponiveis: boolean;
}
export interface FiltroExecucoes {
  pagina: number;
  tamanho: number;
  status?: string;
}
export interface PaginaExecucoes {
  itens: ExecucaoResumo[];
  pagina: number;
  tamanho: number;
  total: number;
}
export interface RepositorioExecucoes {
  estado(): EstadoBanco;
  preparar(): Promise<void>;
  resumo(): Promise<{
    total: number;
    sucesso: number;
    falhas: number;
    emExecucao: number;
  }>;
  listar(filtro: FiltroExecucoes): Promise<PaginaExecucoes>;
  detalhar(id: string): Promise<DetalheExecucao | null>;
  fechar(): Promise<void>;
}
