import { FalhaIntegracao } from "./http.js";
import { codigoHttpSeguro } from "./causas-http.js";

export type FaseAtendimento =
  | "AVALIAR_ATENDIMENTO"
  | "FINALIZAR_CRM"
  | "VALIDAR_DESTINATARIO"
  | "RESERVAR_CONTROLE_LOCAL"
  | "RESERVAR_ENVIO_CRM"
  | "REVALIDAR_CONVERSA"
  | "PERSISTIR_COMPROVANTE";

export class FalhaAtendimento extends Error {
  constructor(readonly fase: FaseAtendimento, readonly origem: unknown) {
    super("FALHA_NO_ATENDIMENTO");
  }
}

export type FaseRodada =
  | "BUSCAR_CONFIGURACAO_CRM"
  | "RECUPERAR_REGISTROS_CRM"
  | "BUSCAR_ATENDIMENTOS_CRM"
  | "PROCESSAR_ATENDIMENTOS"
  | "PERSISTIR_PROGRESSO"
  | "CONCLUIR_RODADA"
  | "LIMPAR_HISTORICO";

const CODIGOS_SEGUROS = new Set([
  "CIRCUITO_ABERTO",
  "RESPOSTA_VAZIA",
  "RESPOSTA_EXCEDE_LIMITE",
  "CONEXAO_OU_RESPOSTA_INVALIDA",
  "CONTRATO_INVALIDO",
  "CONTRATO_TEXTO_INVALIDO",
  "CONTRATO_CONFIGURACAO_CRM_INVALIDO",
  "PARAMETRO_CRM_DUPLICADO",
  "PARAMETRO_CRM_INVALIDO",
  "REGRA_CRM_INVALIDA",
  "REGRA_CRM_DUPLICADA",
  "BOTOES_INVALIDOS",
  "TELEFONE_INVALIDO",
  "NUMERO_NAO_PERMITIDO",
  "TEXTO_INTERATIVO_INVALIDO",
  "EVOLUTION_SEM_COMPROVANTE_DE_SAIDA",
  "COMPROVANTE_META_AUSENTE",
  "RESERVA_CRM_INVALIDA",
  "COMPROVANTE_NAO_PERSISTIDO",
  "COORDENACAO_INTERROMPIDA",
  "PERSISTENCIA_DA_ETAPA_FALHOU",
]);

export function codigoFalha(error: unknown): string {
  if (error instanceof FalhaAtendimento)
    return error.fase + "_" + codigoFalha(error.origem);
  // Mensagens externas podem conter URL, token ou dados do cliente. Expor somente
  // codigos conhecidos: nunca salvar error.message/stack brutos no painel.
  if (
    error instanceof FalhaIntegracao &&
    codigoHttpSeguro(error.codigo)
  )
    return error.codigo;
  if (error instanceof Error) {
    const codigo = error.message.split(":", 1)[0]!;
    if (CODIGOS_SEGUROS.has(codigo)) return codigo;
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[0-9A-Z]{5}$/.test(error.code)
  )
    return "POSTGRES_" + error.code;
  return "CAUSA_NAO_CLASSIFICADA";
}

export function motivoInterrupcao(fase: FaseRodada, error: unknown): string {
  return "RODADA_INTERROMPIDA_" + fase + "_" + codigoFalha(error);
}
