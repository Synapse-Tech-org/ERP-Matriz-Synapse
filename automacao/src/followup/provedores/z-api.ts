import type { PedidoMensagem } from "../contratos.js";
import { objeto, textoObrigatorio, type TransporteJson } from "../http.js";
import type { ConfiguracaoZApi, EnvioWhatsApp } from "./contratos.js";

export class ZApiFollowup implements EnvioWhatsApp {
  constructor(
    private readonly config: ConfiguracaoZApi,
    private readonly http: TransporteJson,
  ) {}

  async enviar(pedido: PedidoMensagem): Promise<string> {
    const c = this.config;
    const resposta = objeto(
      await this.http.chamar(
        `${c.base}/instances/${encodeURIComponent(c.instancia)}/token/${encodeURIComponent(c.token)}/send-button-actions`,
        c.clientToken ? { "Client-Token": c.clientToken } : {},
        {
          phone: pedido.telefone,
          message: pedido.texto,
          buttonActions: pedido.botoes.map((b) => ({
            id: b.id,
            type: "REPLY",
            label: b.titulo,
          })),
        },
      ),
    );
    return textoObrigatorio(resposta.messageId);
  }
}
