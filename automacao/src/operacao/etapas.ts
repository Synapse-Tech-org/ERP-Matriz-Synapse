import { parse as parseFlatted } from "flatted";
import type { EtapaExecucao } from "./contratos.js";

function registro(valor: unknown): Record<string, unknown> | undefined {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : undefined;
}

export function lerEtapas(texto: string): EtapaExecucao[] | undefined {
  try {
    const json: unknown = JSON.parse(texto);
    const raiz = registro(Array.isArray(json) ? parseFlatted(texto) : json);
    const resultado = registro(raiz?.resultData);
    const runs = registro(resultado?.runData);
    if (!runs) return undefined;
    // Nunca devolver inputs, outputs, headers, credenciais ou mensagens de erro brutas.
    return Object.entries(runs)
      .slice(0, 500)
      .map(([nome, valor]) => {
        const tentativas = Array.isArray(valor)
          ? valor.map(registro).filter((v) => v !== undefined)
          : [];
        return {
          nome: nome.slice(0, 200),
          status: tentativas.some(
            (t) => t.error || t.executionStatus === "error",
          )
            ? "erro"
            : "sucesso",
          duracaoMs: tentativas.reduce(
            (total, t) =>
              total +
              (typeof t.executionTime === "number" &&
              Number.isFinite(t.executionTime)
                ? Math.max(0, t.executionTime)
                : 0),
            0,
          ),
          tentativas: tentativas.length,
        };
      });
  } catch {
    return undefined;
  }
}
