export class FalhaIntegracao extends Error {
  constructor(
    readonly codigo: string,
    readonly status?: number,
  ) {
    super(codigo);
  }
}

export interface TransporteJson {
  chamar(
    url: string,
    headers: Record<string, string>,
    corpo?: unknown,
  ): Promise<unknown>;
}

export class HttpJson implements TransporteJson {
  private falhas = 0;
  private bloqueadoAte = 0;
  constructor(
    private readonly timeoutMs: number,
    private readonly fetcher = fetch,
  ) {}

  async chamar(
    url: string,
    headers: Record<string, string>,
    corpo?: unknown,
  ): Promise<unknown> {
    if (Date.now() < this.bloqueadoAte)
      throw new FalhaIntegracao("CIRCUITO_ABERTO");
    try {
      // Sem retry de POST nem redirecionamento: um timeout pode ter ocorrido APOS o envio.
      const response = await this.fetcher(url, {
        method: corpo === undefined ? "GET" : "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new FalhaIntegracao("HTTP_" + response.status, response.status);
      }
      if (response.status === 204) {
        this.falhas = 0;
        return null;
      }
      const reader = response.body?.getReader();
      if (!reader) throw new FalhaIntegracao("RESPOSTA_VAZIA");
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      try {
        for (;;) {
          const parte = await reader.read();
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > 1048576)
            throw new FalhaIntegracao("RESPOSTA_EXCEDE_LIMITE");
          partes.push(parte.value);
        }
      } finally {
        await reader.cancel();
      }
      const resultado: unknown = JSON.parse(
        Buffer.concat(partes).toString("utf8"),
      );
      this.falhas = 0;
      return resultado;
    } catch (error) {
      // Nunca propagar URL, corpo ou headers: alguns provedores colocam tokens na URL.
      if (++this.falhas >= 5) this.bloqueadoAte = Date.now() + 30000;
      if (error instanceof FalhaIntegracao) throw error;
      throw new FalhaIntegracao("CONEXAO_OU_RESPOSTA_INVALIDA");
    }
  }
}

export function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor))
    throw new FalhaIntegracao("CONTRATO_INVALIDO");
  return valor as Record<string, unknown>;
}
export function textoObrigatorio(valor: unknown): string {
  if (typeof valor !== "string" || !valor.trim())
    throw new FalhaIntegracao("CONTRATO_TEXTO_INVALIDO");
  return valor.trim();
}
