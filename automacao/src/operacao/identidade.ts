export interface UsuarioPainel {
  id: string;
  nome: string;
  papel: string;
}
export interface LoginPainel {
  token: string;
  validadeSegundos: number;
  usuario: UsuarioPainel;
}
export interface ProvedorIdentidade {
  autenticar(email: string, senha: string): Promise<LoginPainel>;
  validar(token: string): Promise<UsuarioPainel>;
}
export class FalhaIdentidade extends Error {
  constructor(
    readonly codigo: string,
    readonly status: number,
  ) {
    super(codigo);
  }
}
type Objeto = Record<string, unknown>;
function objeto(valor: unknown): Objeto {
  if (!valor || typeof valor !== "object" || Array.isArray(valor))
    throw new FalhaIdentidade("RESPOSTA_CRM_INVALIDA", 503);
  return valor as Objeto;
}
export function autorizarPainel(
  perfil: unknown,
  permissoes: unknown,
): UsuarioPainel {
  const p = objeto(perfil);
  const m = objeto(permissoes);
  const caps = objeto(m.capacidades);
  const permitida = (nome: string) => {
    const c = caps[nome];
    return (
      c !== null && typeof c === "object" && (c as Objeto).permitido === true
    );
  };
  if (
    !["GESTOR", "SUBGESTOR", "ADMINISTRADOR"].includes(String(p.papel)) ||
    !permitida("automacao.ver") ||
    !permitida("clientes.acessar") ||
    !permitida("atendimentos.ver") ||
    objeto(caps["atendimentos.ver"]).alcance !== "TODOS" ||
    String(m.usuarioId) !== String(p.id)
  ) {
    throw new FalhaIdentidade("SEM_PERMISSAO", 403);
  }
  if (!p.id || !p.nome) throw new FalhaIdentidade("RESPOSTA_CRM_INVALIDA", 503);
  return { id: String(p.id), nome: String(p.nome), papel: String(p.papel) };
}

export class IdentidadeCrm implements ProvedorIdentidade {
  constructor(
    private readonly base: string,
    private readonly cliente: typeof fetch = fetch,
  ) {
    const url = new URL(base);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("AUTOMACAO_CRM_URL_INVALIDA");
  }
  private async chamar(
    caminho: string,
    token?: string,
    corpo?: object,
  ): Promise<unknown> {
    try {
      const response = await this.cliente(new URL(caminho, this.base), {
        method: corpo ? "POST" : "GET",
        redirect: "error",
        headers: {
          Accept: "application/json",
          ...(corpo ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 401)
        throw new FalhaIdentidade("LOGIN_INVALIDO_OU_SESSAO_EXPIRADA", 401);
      if (response.status === 403)
        throw new FalhaIdentidade("SEM_PERMISSAO", 403);
      if (!response.ok) throw new FalhaIdentidade("CRM_INDISPONIVEL", 503);
      const reader = response.body?.getReader();
      if (!reader) throw new FalhaIdentidade("RESPOSTA_CRM_INVALIDA", 503);
      const chunks: Uint8Array[] = [];
      let tamanho = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        tamanho += value.length;
        if (tamanho > 262144) {
          await reader.cancel();
          throw new FalhaIdentidade("RESPOSTA_CRM_INVALIDA", 503);
        }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch (error) {
      if (error instanceof FalhaIdentidade) throw error;
      throw new FalhaIdentidade("CRM_INDISPONIVEL", 503);
    }
  }
  async validar(token: string): Promise<UsuarioPainel> {
    const perfil = await this.chamar("/api/v1/me", token);
    const permissoes = await this.chamar(
      "/api/v1/gestao/permissoes/minhas",
      token,
    );
    return autorizarPainel(perfil, permissoes);
  }
  async autenticar(email: string, senha: string): Promise<LoginPainel> {
    const resposta = objeto(
      await this.chamar("/api/v1/auth/login", undefined, { email, senha }),
    );
    const validade = Number(resposta.expiraEmSegundos);
    if (
      typeof resposta.accessToken !== "string" ||
      !resposta.accessToken ||
      !Number.isFinite(validade) ||
      validade <= 0
    )
      throw new FalhaIdentidade("RESPOSTA_CRM_INVALIDA", 503);
    return {
      token: resposta.accessToken,
      validadeSegundos: Math.min(validade, 86400),
      usuario: await this.validar(resposta.accessToken),
    };
  }
}
