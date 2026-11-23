/**
 * Chaves de `configuracao_automacao` editadas na Gestão › Configurações gerais. Elas saem da lista crua de
 * Automação › Parâmetros avançados para não haver dois lugares editando o mesmo valor.
 */
export const CHAVES_CONFIGURACOES_GERAIS = {
  fimHabilitado: "atendimento.finalizar_fim_expediente.habilitado",
  fimUsarExpediente: "atendimento.finalizar_fim_expediente.usar_expediente",
  fimHorario: "atendimento.finalizar_fim_expediente.horario",
  inativosHabilitado: "atendimento.finalizar_inativos.habilitado",
  inativosHoras: "atendimento.finalizar_apos_horas",
  semResposta: "atendimentos.limite_sem_resposta_minutos",
  presenca: "presenca.automatica",
  audio: "gravacao_audio.duracao_maxima_segundos",
  expedienteInicio: "alerta.horario_cliente.inicio",
  expedienteFim: "alerta.horario_cliente.fim",
  avaliacao: "avaliacao_atendimento.habilitada",
  nps: "avaliacao_atendimento.nps_habilitado",
  npsPergunta: "avaliacao_atendimento.nps_pergunta",
} as const;

export const DIAS_DA_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;
export type DiaDaSemana = (typeof DIAS_DA_SEMANA)[number];

const PREFIXO_DO_DIA = "alerta.horario_cliente.";
export const chaveDoDia = (dia: DiaDaSemana) => `${PREFIXO_DO_DIA}${dia}`;

const CHAVES = new Set<string>([...Object.values(CHAVES_CONFIGURACOES_GERAIS), ...DIAS_DA_SEMANA.map(chaveDoDia)]);

export function pertenceAsConfiguracoesGerais(chave: string): boolean {
  return CHAVES.has(chave);
}

export type ModoDoDia = "padrao" | "fechado" | "proprio";
export interface ExpedienteDoDia { modo: ModoDoDia; inicio: string; fim: string }

const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;
const FAIXA = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/;

export function horarioValido(inicio: string, fim: string): boolean {
  return HORARIO.test(inicio) && HORARIO.test(fim) && fim > inicio;
}

/** Mesma leitura do backend: "fechado", "HH:mm-HH:mm" ou qualquer outra coisa = janela padrão. */
export function lerDia(valor: string): ExpedienteDoDia {
  const normalizado = valor.trim().toLowerCase();
  if (normalizado === "fechado") return { modo: "fechado", inicio: "", fim: "" };
  const faixa = FAIXA.exec(normalizado);
  if (faixa && horarioValido(faixa[1], faixa[2])) return { modo: "proprio", inicio: faixa[1], fim: faixa[2] };
  return { modo: "padrao", inicio: "", fim: "" };
}

export function escreverDia({ modo, inicio, fim }: ExpedienteDoDia): string {
  if (modo === "proprio") return `${inicio}-${fim}`;
  return modo;
}
