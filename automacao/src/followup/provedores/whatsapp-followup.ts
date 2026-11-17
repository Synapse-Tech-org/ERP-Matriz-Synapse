import type { PedidoMensagem, ProvedorFollowup } from "../contratos.js";
import type { EnvioWhatsApp } from "./contratos.js";

export interface RestricaoNumeros {
  habilitada: boolean;
  numeros: string[];
}

export class WhatsAppFollowup implements ProvedorFollowup {
  constructor(
    private readonly envio: EnvioWhatsApp,
    private readonly restricao: RestricaoNumeros,
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
    // A barreira tambem protege chamadas diretas, fora do processador de atendimentos.
    this.validar(pedido);
    return this.envio.enviar(pedido);
  }
}
