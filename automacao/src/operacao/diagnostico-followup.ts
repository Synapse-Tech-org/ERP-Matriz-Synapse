import { codigoFalha } from "../followup/falhas.js";
import { FalhaIntegracao } from "../followup/http.js";

export function motivoSeguro(motivo: unknown): string | null {
  if (typeof motivo !== "string" || !motivo) return null;
  // Registros legados podem conter texto externo. Expor somente causas conhecidas,
  // nunca URL, resposta HTTP completa ou detalhes com credenciais.
  for (const prefixo of [
    "REGISTRO_CRM_PENDENTE",
    "RESULTADO_DO_PROVEDOR_NAO_COMPROVADO",
  ]) {
    if (motivo === prefixo) return prefixo;
    if (motivo.startsWith(prefixo + "_")) {
      const causa = motivo.slice(prefixo.length + 1);
      if (/^POSTGRES_[0-9A-Z]{5}$/.test(causa)) return prefixo + "_" + causa;
      return prefixo + "_" + codigoFalha(new FalhaIntegracao(causa));
    }
  }
  return "CAUSA_NAO_CLASSIFICADA";
}
