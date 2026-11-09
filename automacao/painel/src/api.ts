import type {
  DetalheExecucao,
  PaginaExecucoes,
} from "../../src/operacao/contratos";
export type { DetalheExecucao, PaginaExecucoes };
export interface Usuario {
  nome: string;
  papel: string;
}
export interface EstadoOperacao {
  estado: string;
  automacaoHabilitada: boolean;
  followUpHabilitado: boolean;
  executorDisponivel: boolean;
  resumo: {
    total: number;
    sucesso: number;
    falhas: number;
    emExecucao: number;
  } | null;
}
export class ErroApi extends Error {
  constructor(
    readonly codigo: string,
    readonly status: number,
  ) {
    super(codigo);
  }
}
async function chamar<T>(rota: string, body?: object): Promise<T> {
  const response = await fetch("/painel/api" + rota, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response
    .json()
    .catch(() => ({ codigo: "RESPOSTA_INVALIDA" }));
  if (!response.ok) {
    if (response.status === 401 && !(rota === "/sessao" && body))
      window.dispatchEvent(new Event("sessao-expirada"));
    throw new ErroApi(data.codigo || "ERRO", response.status);
  }
  return data as T;
}
export const api = {
  sessao: () => chamar<{ usuario: Usuario }>("/sessao"),
  entrar: (email: string, senha: string) =>
    chamar<{ usuario: Usuario }>("/sessao", { email, senha }),
  sair: () => chamar("/sair", {}),
  estado: () => chamar<EstadoOperacao>("/status"),
  listar: (pagina: number, status: string) =>
    chamar<PaginaExecucoes>(
      "/execucoes?" +
        new URLSearchParams({
          pagina: String(pagina),
          tamanho: "20",
          ...(status ? { status } : {}),
        }),
    ),
  detalhar: (id: string) =>
    chamar<DetalheExecucao>("/execucoes/" + encodeURIComponent(id)),
};
