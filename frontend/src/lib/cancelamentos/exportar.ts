import { listarCancelamentos, type ConfiguracaoCancelamentos, type FiltrosCancelamentos, type Cancelamento } from "./api";

function celula(valor: string | null | undefined) {
  const texto = valor ?? "";
  const seguro = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(texto) ? "'" + texto : texto;
  return '"' + seguro.replaceAll('"', '""') + '"';
}

export async function exportarCancelamentos(
  filtros: FiltrosCancelamentos,
  config: ConfiguracaoCancelamentos,
  colunas: readonly { titulo: string; valor: (item: Cancelamento) => string | null | undefined }[],
  signal: AbortSignal,
): Promise<Blob | null> {
  const linhas = [colunas.map(({ titulo }) => celula(titulo)).join(";")];
  const exportados = new Set<string>();
  for (let pagina = 0; pagina < config.maximoPaginas; pagina++) {
    const resultado = await listarCancelamentos(filtros, pagina, config.tamanhoPagina, signal);
    for (const item of resultado.itens) {
      if (exportados.has(item.id)) continue;
      exportados.add(item.id);
      linhas.push(colunas.map(({ valor }) => celula(valor(item))).join(";"));
    }
    if (!resultado.temProxima) {
      return new Blob(["\uFEFF", linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    }
  }
  return null;
}
