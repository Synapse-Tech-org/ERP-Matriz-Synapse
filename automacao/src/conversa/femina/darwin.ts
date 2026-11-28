import { objeto, texto } from '../json.js';

export type OperacaoDarwin = (metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', caminho: string,
  opcoes: { consulta?: Record<string,string>; corpo?: object }) => Promise<unknown>;
export interface Horario {
  data: string; inicio: string; fim: string; grade: string; profissional: string;
}

function campos(valor: unknown): Record<string,unknown>[] {
  if (!valor || typeof valor !== 'object') return [];
  if (Array.isArray(valor)) return valor.flatMap(campos);
  return [objeto(valor), ...Object.values(valor).flatMap(campos)];
}

function normalizar(s: string) {
  return s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escolher(raiz: unknown, nome: string, tipo: 'insurance' | 'procedure'): string {
  const alvo = normalizar(nome);
  if (!alvo) throw new Error('DARWIN_NOME_AUSENTE');
  const itens = campos(raiz).map(r => ({ id: texto(r[tipo + 'Id'] ?? r.id),
    nome: normalizar(String(r.name ?? r[tipo + 'Name'] ?? '')) })).filter(i => i.id && i.nome);
  const exatos = itens.filter(i => i.nome === alvo);
  const candidatos = exatos.length || tipo === 'procedure' ? exatos :
    itens.filter(i => i.nome.includes(alvo) || alvo.includes(i.nome));
  const ids = new Set(candidatos.map(i => i.id));
  if (ids.size !== 1) throw new Error('DARWIN_CATALOGO_AMBIGUO_OU_AUSENTE');
  return candidatos[0]!.id!;
}

function horarios(valor: unknown, data: string, profissional: string, grade = ''): Horario[] {
  if (Array.isArray(valor)) return valor.flatMap(v => horarios(v, data, profissional, grade));
  if (!valor || typeof valor !== 'object') return [];
  const r = objeto(valor);
  grade = texto(r.timetableId) ?? grade;
  profissional = texto(r.professionalId) ?? profissional;
  const lista: Horario[] = [];
  for (const t of Array.isArray(r.availableTimes) ? r.availableTimes : []) {
    const inicio = String(typeof t === 'string' ? t : objeto(t).startTime ?? objeto(t).time).slice(0,5);
    if (!grade || !/^([01]\d|2[0-3]):[0-5]\d$/.test(inicio)) continue;
    const minutos = (Number(inicio.slice(0,2)) * 60 + Number(inicio.slice(3)) + 15) % 1440;
    const fim = [Math.floor(minutos / 60), minutos % 60].map(n => String(n).padStart(2,'0')).join(':');
    lista.push({ data, inicio, fim, grade, profissional });
  }
  for (const [k,v] of Object.entries(r)) if (k !== 'availableTimes') lista.push(...horarios(v,data,profissional,grade));
  return lista;
}

export class AgendaDarwin {
  constructor(private readonly http: OperacaoDarwin) {}

  private async chamar(...args: Parameters<OperacaoDarwin>) {
    const resultado = await this.http(...args);
    const r = objeto(resultado);
    if (r.error || r.erro || r.success === false || r.sucesso === false || Number(r.statusCode) >= 400)
      throw new Error('DARWIN_RECUSOU_OPERACAO');
    return resultado;
  }

  async listarDia(data: string, profissional: string) {
    const r = await this.chamar('GET','/api/timetables/list/available',{ consulta: { date: data, professionalIds: profissional } });
    const itens = horarios(r,data,profissional);
    return [...new Map(itens.map(h => [h.grade + ':' + h.inicio,h])).values()];
  }

  confirmar(scheduleId: string) {
    if (!scheduleId.trim()) throw new Error('AGENDAMENTO_NAO_IDENTIFICADO');
    return this.chamar('PUT','/api/schedules/update',{ corpo: { scheduleId, status: 'Confirmado' } });
  }

  cancelar(scheduleId: string) {
    if (!scheduleId.trim()) throw new Error('AGENDAMENTO_NAO_IDENTIFICADO');
    return this.chamar('DELETE','/api/schedules/delete',{ consulta: { scheduleId } });
  }

  async remarcar(scheduleId: string, h: Horario, inicioComFuso: Date, agora = new Date()) {
    if (!scheduleId.trim() || !(inicioComFuso.getTime() > agora.getTime())) throw new Error('REMARCACAO_INVALIDA');
    await this.verificar(h);
    return this.chamar('PUT','/api/schedules/update',{ corpo: { scheduleId, timetableId: h.grade,
      date: h.data + 'T00:00:00.000Z', time: h.inicio, endTime: h.fim } });
  }

  private async verificar(h: Horario) {
    const disponiveis = await this.listarDia(h.data,h.profissional);
    if (!disponiveis.some(i => i.grade === h.grade && i.inicio === h.inicio && i.profissional === h.profissional && i.fim === h.fim))
      throw new Error('HORARIO_INDISPONIVEL');
  }

  // O chamador precisa identificar o paciente antes desta etapa; nao criar por
  // tentativa e erro nem repetir uma escrita de resultado incerto.
  async agendarPacienteIdentificado(h: Horario, cpf: string, convenio: string, procedimento: string, observacao: string) {
    const digitos = cpf.replace(/[.\-]/g,'');
    if (!/^\d{11}$/.test(digitos)) throw new Error('CPF_INVALIDO');
    const catalogo = (tipo: string, name: string) => this.chamar('GET','/api/' + tipo + '/list/location',
      { consulta: { name, page: '1', amount: '100' } });
    const insuranceId = escolher(await catalogo('insurances', convenio), convenio, 'insurance');
    const procedureId = escolher(await catalogo('procedures', procedimento), procedimento, 'procedure');
    await this.verificar(h);
    const patient = { cpf: digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') };
    const r = objeto(await this.chamar('POST','/api/schedules/create',{ corpo: { timetableId: h.grade,
      status: 'Marcado', time: h.inicio, endTime: h.fim, date: h.data, observation: observacao,
      insuranceProcedures: [{insuranceId, procedureId}], patient } }));
    const id = texto(r.scheduleId ?? r.id ?? objeto(r.data).id);
    if (id) return id;
    if (!r.message) throw new Error('CRIACAO_SEM_COMPROVANTE_NAO_REPETIR');
    const agenda = await this.chamar('GET','/api/schedules/list/patient',{ consulta: { cpf: patient.cpf, startDate: h.data, endDate: h.data } });
    const candidatos = campos(agenda).filter(i => String(i.date ?? i.scheduleDate ?? i.startDate).slice(0,10) === h.data &&
      String(i.time ?? i.startTime).slice(0,5) === h.inicio && (!i.timetableId || i.timetableId === h.grade));
    const encontrados = candidatos.map(i => texto(i.scheduleId ?? i.id)).filter(Boolean);
    if (encontrados.length !== 1) throw new Error('CRIACAO_SEM_COMPROVANTE_NAO_REPETIR');
    return encontrados[0]!;
  }
}
