import { objeto, textoObrigatorio, type TransporteJson } from "../followup/http.js";
import type { ConfiguracaoProvedor } from "../followup/provedores/contratos.js";
import { EnvioEvolution } from "../sistematicas/provedores/evolution.js";
import { EnvioZApi } from "../sistematicas/provedores/z-api.js";

export interface CanalTexto {
  enviar(telefone: string, texto: string): Promise<string>;
}

export function canalDeConversa(config: ConfiguracaoProvedor, http: TransporteJson,
  publico: {habilitada:boolean; numeros:readonly string[]}): CanalTexto {
  const canal = adaptar(config,http);
  return { async enviar(telefone,texto) {
    if (!/^[1-9]\d{7,14}$/.test(telefone) || !texto.trim()) throw new Error("RESPOSTA_INVALIDA");
    if (publico.habilitada && !publico.numeros.includes(telefone)) throw new Error("NUMERO_NAO_PERMITIDO");
    return canal.enviar(telefone,texto);
  }};
}

function adaptar(config: ConfiguracaoProvedor,http:TransporteJson): CanalTexto {
  switch (config.tipo) {
    case "evolution": return new EnvioEvolution(config,http);
    case "z-api": return new EnvioZApi(config,http);
    case "meta": return { async enviar(to,body) {
      // Resposta a uma conversa, nao um template de campanha.
      const r = objeto(await http.chamar(config.base+"/"+encodeURIComponent(config.numero)+"/messages",
        {Authorization:"Bearer "+config.token},{messaging_product:"whatsapp",to,type:"text",text:{body}}));
      return textoObrigatorio(objeto(Array.isArray(r.messages)?r.messages[0]:null).id);
    }};
  }
}
