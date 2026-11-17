const CAUSAS = new Set([
  "RESERVA_CONFLITANTE", "WAMID_OUTRO_ATENDIMENTO", "ATENDIMENTO_NAO_ENCONTRADO",
  "WAMID_OBRIGATORIO", "CHAVE_ENVIO_INVALIDA", "TIPO_OBRIGATORIO",
  "CONTEUDO_OBRIGATORIO", "MIDIA_OBRIGATORIA", "OPCOES_OBRIGATORIAS",
]);

export function codigoHttpSeguro(codigo: string): boolean {
  const m = /^(HTTP_[1-5]\d{2})(?:_([A-Z_]+))?$/.exec(codigo);
  return Boolean(m && (!m[2] || CAUSAS.has(m[2])));
}

export function classificarRespostaHttp(dado: unknown): string | undefined {
  if (!dado || typeof dado !== "object") return undefined;
  const d = dado as Record<string, unknown>;
  // Somente igualdade com textos conhecidos do contrato. Nunca devolver o texto
  // externo: detail pode conter telefone, mensagem, token ou valor rejeitado.
  const detalhe = typeof d.detail === "string" ? d.detail : "";
  const porDetalhe: Record<string, string> = {
    "wamid e obrigatorio": "WAMID_OBRIGATORIO",
    "chaveDeEnvio vazia ou maior que 200 caracteres": "CHAVE_ENVIO_INVALIDA",
    "tipo e obrigatorio": "TIPO_OBRIGATORIO",
    "conteudo e obrigatorio para TEXTO": "CONTEUDO_OBRIGATORIO",
    "midiaUrl e obrigatorio para mensagens de midia": "MIDIA_OBRIGATORIA",
    "opcoes e obrigatorio para mensagens interativas": "OPCOES_OBRIGATORIAS",
  };
  if (Object.hasOwn(porDetalhe, detalhe)) return porDetalhe[detalhe];
  const titulo = typeof d.title === "string" ? d.title : "";
  const porTitulo: Record<string, string> = {
    "Chave de envio conflitante": "RESERVA_CONFLITANTE",
    "wamid ja registrado": "WAMID_OUTRO_ATENDIMENTO",
    "Atendimento nao encontrado": "ATENDIMENTO_NAO_ENCONTRADO",
  };
  return Object.hasOwn(porTitulo, titulo) ? porTitulo[titulo] : undefined;
}

export async function lerCausaHttp(response: Response): Promise<string | undefined> {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      tamanho += value.byteLength;
      if (tamanho > 8192) return undefined;
      partes.push(value);
    }
    return classificarRespostaHttp(JSON.parse(Buffer.concat(partes).toString("utf8")));
  } catch {
    // Corpo invalido/grande nao deve esconder o status HTTP original.
    return undefined;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
