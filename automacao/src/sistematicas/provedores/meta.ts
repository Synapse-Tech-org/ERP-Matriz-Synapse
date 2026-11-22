import { objeto, textoObrigatorio, type TransporteJson } from "../../followup/http.js";
import type { ConfiguracaoMeta } from "../../followup/provedores/contratos.js";
import type { CanalSistematico, Template } from "../canal.js";

export class EnvioMeta implements CanalSistematico {
  constructor(private config: ConfiguracaoMeta, private http: TransporteJson) {}
  async enviar(to: string, text: string, template?: Template): Promise<string> {
    if (!template) throw new Error("TEMPLATE_META_NAO_CONFIGURADO");
    const body = { messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
      template: { name: template.nome, language: { code: template.idioma }, components: [
        { type: "body", parameters: [{ type: "text", parameter_name: template.parametro, text }] }
      ] }};
    const r = objeto(await this.http.chamar(this.config.base + "/" + encodeURIComponent(this.config.numero) + "/messages",
      { Authorization: "Bearer " + this.config.token }, body));
    if (!Array.isArray(r.messages)) throw new Error("META_SEM_COMPROVANTE");
    return textoObrigatorio(objeto(r.messages[0]).id);
  }
}
