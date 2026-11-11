import type { PedidoMensagem, ProvedorFollowup } from "./contratos.js";
import { objeto, textoObrigatorio, type TransporteJson } from "./http.js";

export type ConfiguracaoProvedor =
  | { tipo: "evolution"; base: string; instancia: string; token: string }
  | {
      tipo: "z-api";
      base: string;
      instancia: string;
      token: string;
      clientToken: string;
    }
  | { tipo: "meta"; base: string; numero: string; token: string };

export class WhatsAppFollowup implements ProvedorFollowup {
  constructor(
    private readonly config: ConfiguracaoProvedor,
    private readonly http: TransporteJson,
    private readonly restricao: { habilitada: boolean; numeros: string[] },
  ) {}

  validar(pedido: PedidoMensagem): void {
    if (!/^[1-9]\d{7,14}$/.test(pedido.telefone))
      throw new Error("TELEFONE_INVALIDO");
    if (
      this.restricao.habilitada &&
      !this.restricao.numeros.includes(pedido.telefone)
    )
      throw new Error("NUMERO_NAO_PERMITIDO");
    if (!pedido.texto.trim() || pedido.texto.length > 1024)
      throw new Error("TEXTO_INTERATIVO_INVALIDO");
    if (
      pedido.botoes.length !== 2 ||
      pedido.botoes.some((b) => !b.id || !b.titulo || b.titulo.length > 20)
    )
      throw new Error("BOTOES_INVALIDOS");
  }

  async enviar(pedido: PedidoMensagem): Promise<string> {
    this.validar(pedido);
    const c = this.config;
    switch (c.tipo) {
      case "evolution": {
        const resposta = objeto(
          await this.http.chamar(
            `${c.base}/message/sendButtons/${encodeURIComponent(c.instancia)}`,
            { apikey: c.token },
            {
              number: pedido.telefone,
              title: pedido.texto,
              footer: "",
              buttons: pedido.botoes.map((b) => ({
                type: "reply",
                displayText: b.titulo,
                id: b.id,
              })),
            },
          ),
        );
        const chave = objeto(resposta.key);
        if (chave.fromMe !== true)
          throw new Error("EVOLUTION_SEM_COMPROVANTE_DE_SAIDA");
        return textoObrigatorio(chave.id);
      }
      case "z-api": {
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
      case "meta": {
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
  }
}
