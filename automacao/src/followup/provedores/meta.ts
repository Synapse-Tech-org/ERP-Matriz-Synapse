import type { PedidoMensagem } from "../contratos.js";
import { objeto, textoObrigatorio, type TransporteJson } from "../http.js";
import type { ConfiguracaoMeta, EnvioWhatsApp } from "./contratos.js";

export class MetaFollowup implements EnvioWhatsApp {
  constructor(
    private readonly config: ConfiguracaoMeta,
    private readonly http: TransporteJson,
  ) {}

  async enviar(pedido: PedidoMensagem): Promise<string> {
    const c = this.config;
    const resposta = objeto(
      await this.http.chamar(
        `${c.base}/${encodeURIComponent(c.numero)}/messages`,
        { Authorization: "Bearer " + c.token },
        {
          messaging_product: "whatsapp",
          to: pedido.telefone,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: pedido.texto },
            action: {
              buttons: pedido.botoes.map((b) => ({
                type: "reply",
                reply: { id: b.id, title: b.titulo },
              })),
            },
          },
        },
      ),
    );
    if (!Array.isArray(resposta.messages))
      throw new Error("COMPROVANTE_META_AUSENTE");
    return textoObrigatorio(objeto(resposta.messages[0]).id);
  }
}
