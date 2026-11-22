import { objeto, textoObrigatorio, type TransporteJson } from "../followup/http.js";
import { lerPolitica, type Candidato, type Expediente, type Festiva, type Regra } from "./regras.js";

function lista(x: unknown) {
  if (!Array.isArray(x)) throw new Error("LISTA_CRM_INVALIDA");
  return x.map(objeto);
}
export class CrmSistematicas {
  constructor(private base: string, private token: string, private http: TransporteJson) {}
  private chamar(path: string, body?: unknown) {
    return this.http.chamar(this.base + "/internal/v1" + path, { "X-Synapse-Token": this.token }, body);
  }
  async configuracao() {
    const config = objeto(await this.chamar("/automation-config"));
    const parametros = new Map(lista(config.parametros).map(x => [textoObrigatorio(x.chave), x.valor]));
    const politica = lerPolitica(parametros);
    const expediente: Expediente[] = politica.somenteHorarioComercial
      ? JSON.parse(textoObrigatorio(parametros.get("sistematicas.expediente"))) : [];
    return { politica, expediente, parametros };
  }
  async catalogo() {
    const aniversario = objeto(await this.chamar("/fidelizacao/aniversariantes-hoje"));
    const ids = new Set(aniversario.habilitado === true ? lista(aniversario.leads).map(l => textoObrigatorio(l.id)) : []);
    const festivas: Festiva[] = lista(await this.chamar("/mensagens-festivas/hoje")).map(f => ({
      id: textoObrigatorio(f.id), mensagem: textoObrigatorio(f.mensagem)
    }));
    const regras: Regra[] = lista(await this.chamar("/regras/fidelizacao")).map(r => {
      if (typeof r.diasSemContato !== "number" || !Number.isInteger(r.diasSemContato) || r.diasSemContato < 1) throw new Error("PRAZO_CRM_INVALIDO");
      return { id: textoObrigatorio(r.id), diasSemContato: r.diasSemContato, mensagem: textoObrigatorio(r.mensagem) };
    });
    return { ids, aniversario: ids.size ? textoObrigatorio(aniversario.mensagem) : "", festivas, regras };
  }
  async reservar(leadId: string, pedido: Candidato, chave: string, execucaoId: string) {
    const r = objeto(await this.chamar("/leads/" + leadId + "/envios-proativos/reservas",
      { tipo: pedido.tipo, regraId: pedido.regra, ocorrencia: pedido.ciclo, chave, execucaoId }));
    if (typeof r.podeEnviar !== "boolean") throw new Error("RESERVA_CRM_INVALIDA");
    return r.podeEnviar;
  }
  async registrar(atendimentoId: string, chave: string, texto: string, wamid: string) {
    return textoObrigatorio(objeto(await this.chamar("/atendimentos/" + atendimentoId + "/mensagens-enviadas",
      { tipo: "TEXTO", conteudo: texto, wamid, chaveDeEnvio: chave })).mensagemId);
  }
}
