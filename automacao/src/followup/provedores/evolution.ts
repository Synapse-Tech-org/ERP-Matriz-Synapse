import type { PedidoMensagem } from "../contratos.js";
import { objeto, textoObrigatorio, type TransporteJson } from "../http.js";
import type { ConfiguracaoEvolution, EnvioWhatsApp } from "./contratos.js";

export class EvolutionFollowup implements EnvioWhatsApp {
  constructor(
    private readonly config: ConfiguracaoEvolution,
    private readonly http: TransporteJson,
  ) {}

  async enviar(pedido: PedidoMensagem): Promise<string> {
    const c = this.config;
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
    // Um HTTP bem-sucedido sem ID de saida nao autoriza registrar sucesso no CRM.
    if (chave.fromMe !== true)
      throw new Error("EVOLUTION_SEM_COMPROVANTE_DE_SAIDA");
    return textoObrigatorio(chave.id);
  }
}
