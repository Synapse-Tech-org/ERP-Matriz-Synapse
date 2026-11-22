import { objeto, textoObrigatorio, type TransporteJson } from "../../followup/http.js";
import type { ConfiguracaoEvolution } from "../../followup/provedores/contratos.js";
import type { CanalSistematico } from "../canal.js";

export class EnvioEvolution implements CanalSistematico {
  constructor(private config: ConfiguracaoEvolution, private http: TransporteJson) {}
  async enviar(number: string, text: string): Promise<string> {
    const r = objeto(await this.http.chamar(this.config.base + "/message/sendText/" + encodeURIComponent(this.config.instancia),
      { apikey: this.config.token }, { number, text }));
    const key = objeto(r.key);
    if (key.fromMe !== true) throw new Error("EVOLUTION_SEM_COMPROVANTE");
    return textoObrigatorio(key.id);
  }
}
