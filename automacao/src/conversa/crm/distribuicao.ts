import { objeto, textoObrigatorio, type TransporteJson } from "../../followup/http.js";
import { politicasConversa } from "../agente/politicas.js";

export class DistribuicaoCrm {
  constructor(private readonly http:TransporteJson,private readonly base:string,private readonly token:string) {}
  async consultar() {
    const get = (rota:string) => this.http.chamar(new URL("/internal/v1/"+rota,this.base).href,{"X-Synapse-Token":this.token});
    const [lista,config] = await Promise.all([get("atendentes/disponiveis"),get("automation-config")]);
    const parametros = objeto(config).parametros;
    if (!Array.isArray(lista) || !Array.isArray(parametros)) throw new Error("DISTRIBUICAO_CRM_INVALIDA");
    const valores = parametros.map(objeto).filter(p=>p.chave==="transferencia.por_lista");
    const modo = valores[0]?.valor;
    if (valores.length!==1 || (modo!=="true" && modo!=="false")) throw new Error("MODO_TRANSFERENCIA_INVALIDO");
    // Preservar a ordem do CRM; nao enviar emails para o modelo.
    return {politicas:politicasConversa(parametros.map(objeto)),porLista:modo==="true",equipe:lista.map(l=>{
      const a=objeto(l);
      return {usuarioId:textoObrigatorio(a.usuarioId),nome:textoObrigatorio(a.nome)};
    })};
  }
}
