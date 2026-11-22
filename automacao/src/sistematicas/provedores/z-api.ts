import { objeto, textoObrigatorio, type TransporteJson } from "../../followup/http.js";
import type { ConfiguracaoZApi } from "../../followup/provedores/contratos.js";
import type { CanalSistematico } from "../canal.js";

export class EnvioZApi implements CanalSistematico {
  constructor(private config: ConfiguracaoZApi, private http: TransporteJson) {}
  async enviar(phone: string, message: string): Promise<string> {
    const url = this.config.base + "/instances/" + encodeURIComponent(this.config.instancia) + "/token/" + encodeURIComponent(this.config.token) + "/send-text";
    const r = objeto(await this.http.chamar(url, this.config.clientToken ? { "Client-Token": this.config.clientToken } : {}, { phone, message }));
    return textoObrigatorio(r.messageId);
  }
}
