import type { ConfiguracaoProvedor } from "../followup/provedores.js";
import type { TransporteJson } from "../followup/http.js";

import { EnvioEvolution } from "./provedores/evolution.js";
import { EnvioZApi } from "./provedores/z-api.js";
import { EnvioMeta } from "./provedores/meta.js";

export interface Template { nome: string; idioma: string; parametro: string }
export interface CanalSistematico {
  enviar(telefone: string, texto: string, template?: Template): Promise<string>;
}

export function criarCanal(config: ConfiguracaoProvedor, http: TransporteJson): CanalSistematico {
  // Cada implementacao conhece apenas o formato exigido pela respectiva API.
  switch (config.tipo) {
    case "evolution": return new EnvioEvolution(config, http);
    case "z-api": return new EnvioZApi(config, http);
    case "meta": return new EnvioMeta(config, http);
  }
}

export function publicoDeTeste(lista: string | undefined): ReadonlySet<string> {
  const numeros = lista?.split(",").map(x => x.trim()) ?? [];
  if (!numeros.length || numeros.some(n => !/^[1-9]\d{7,14}$/.test(n))) throw new Error("PUBLICO_DE_TESTE_INVALIDO");
  return new Set(numeros);
}
