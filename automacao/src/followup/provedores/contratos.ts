import type { PedidoMensagem } from "../contratos.js";

export interface ConfiguracaoEvolution {
  tipo: "evolution";
  base: string;
  instancia: string;
  token: string;
}

export interface ConfiguracaoZApi {
  tipo: "z-api";
  base: string;
  instancia: string;
  token: string;
  clientToken: string;
}

export interface ConfiguracaoMeta {
  tipo: "meta";
  base: string;
  numero: string;
  token: string;
}

export type ConfiguracaoProvedor =
  | ConfiguracaoEvolution
  | ConfiguracaoZApi
  | ConfiguracaoMeta;

// Cada adaptador traduz o pedido e devolve o ID aceito, nao prova de leitura.
export interface EnvioWhatsApp {
  enviar(pedido: PedidoMensagem): Promise<string>;
}
