import type { ProvedorFollowup } from "./contratos.js";
import type { TransporteJson } from "./http.js";
import type { ConfiguracaoProvedor, EnvioWhatsApp } from "./provedores/contratos.js";
import { EvolutionFollowup } from "./provedores/evolution.js";
import { MetaFollowup } from "./provedores/meta.js";
import { ZApiFollowup } from "./provedores/z-api.js";
import { WhatsAppFollowup, type RestricaoNumeros } from "./provedores/whatsapp-followup.js";

export type { ConfiguracaoProvedor } from "./provedores/contratos.js";

// A escolha da API fica na montagem das dependencias, nunca no caso de uso.
// Adicionar um canal nao exige modificar as regras ou a validacao compartilhada.
export function criarProvedorFollowup(
  config: ConfiguracaoProvedor,
  http: TransporteJson,
  restricao: RestricaoNumeros,
): ProvedorFollowup {
  let envio: EnvioWhatsApp;
  switch (config.tipo) {
    case "evolution":
      envio = new EvolutionFollowup(config, http);
      break;
    case "meta":
      envio = new MetaFollowup(config, http);
      break;
    case "z-api":
      envio = new ZApiFollowup(config, http);
      break;
  }
  return new WhatsAppFollowup(envio, restricao);
}
