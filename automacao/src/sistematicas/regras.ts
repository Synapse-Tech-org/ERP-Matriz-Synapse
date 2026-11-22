export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  atendimentoId: string | null;
  status: string | null;
  criadoEm: string;
  ultimaInteracaoEm: string | null;
  ultimaEntradaEm: string | null;
}

export interface Regra { id: string; diasSemContato: number; mensagem: string }
export interface Festiva { id: string; mensagem: string }
export interface Expediente { dia: number; inicio: string; fim: string }
export interface Politica { excluirFinalizados: boolean; somenteHorarioComercial: boolean }
export const PADROES: Readonly<Politica> = {
  excluirFinalizados: true,
  somenteHorarioComercial: false,
};

export function lerPolitica(parametros: ReadonlyMap<string, unknown>): Politica {
  function flag(chave: string, fallback: boolean) {
    if (!parametros.has(chave)) return fallback;
    const valor = parametros.get(chave);
    if (valor === true || valor === "true") return true;
    if (valor === false || valor === "false") return false;
    throw new Error("CONFIG_INVALIDA: " + chave);
  }
  return {
    excluirFinalizados: flag("fidelizacao.excluir_finalizados", PADROES.excluirFinalizados),
    somenteHorarioComercial: flag("sistematicas.somente_horario_comercial", PADROES.somenteHorarioComercial),
  };
}

export function calendario(agora: Date, fuso: string) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(agora);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find(p => p.type === tipo)!.value;
  const data = [valor("year"), valor("month"), valor("day")].join("-");
  return { data, dia: new Date(data + "T12:00:00Z").getUTCDay(), hora: valor("hour") + ":" + valor("minute") };
}

export function dentroDoExpediente(agora: ReturnType<typeof calendario>, periodos: Expediente[]) {
  const horario = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!Array.isArray(periodos) || periodos.some(p => !p || !Number.isInteger(p.dia) || p.dia < 0 || p.dia > 6 ||
    !horario.test(p.inicio) || !horario.test(p.fim) || p.inicio >= p.fim)) throw new Error("EXPEDIENTE_INVALIDO");
  return periodos.some(p => p.dia === agora.dia && p.inicio <= agora.hora && agora.hora < p.fim);
}

export interface Candidato {
  tipo: "ANIVERSARIO" | "FESTIVA" | "FIDELIZACAO";
  regra: string;
  ciclo: string;
  texto: string;
}

export function fidelizacao(lead: Lead, regras: Regra[], politica: Politica, agora: Date): Candidato | undefined {
  if (politica.excluirFinalizados && (!lead.status ||
    ["FINALIZADO", "FINALIZADA", "ENCERRADO", "FECHADO", "CANCELADO"].includes(lead.status))) return;
  const dias = Math.floor((agora.getTime() - Date.parse(lead.ultimaInteracaoEm ?? lead.criadoEm)) / 86400000);
  const faixa = regras.filter(r => r.diasSemContato > 0 && r.diasSemContato <= dias)
    .sort((a, b) => b.diasSemContato - a.diasSemContato || a.id.localeCompare(b.id))[0];
  if (!faixa) return;
  // A saida tambem move ultimaInteracaoEm. So uma nova entrada inicia outro ciclo de envios.
  return { tipo: "FIDELIZACAO", regra: faixa.id, ciclo: lead.ultimaEntradaEm ?? lead.criadoEm, texto: faixa.mensagem };
}

export function personalizar(texto: string, nome: string) {
  if (!texto.trim() || (/\[nome\]|\{nome\}/i.test(texto) && !nome.trim())) return null;
  return texto.replace(/\[nome\]|\{nome\}/gi, () => nome.trim()).trim();
}
