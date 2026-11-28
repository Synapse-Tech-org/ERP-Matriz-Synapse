import { objeto, textoObrigatorio, type TransporteJson } from '../../followup/http.js';

// O token pertence ao cliente HTTP desta instancia, nao a uma credencial do n8n.
export class SessaoTecnica {
  private atual?: { token: string; renovarEm: number };
  private renovacao: Promise<string> | undefined;
  constructor(private readonly base: string, private readonly login: { email: string; senha: string },
    private readonly http: TransporteJson, private readonly agora = Date.now) {}

  async obter(): Promise<string> {
    if (this.atual && this.agora() < this.atual.renovarEm) return this.atual.token;
    // Um lote de webhooks simultaneos nao deve causar um login por mensagem.
    return this.renovacao ??= this.autenticar().finally(() => { this.renovacao = undefined; });
  }

  private async autenticar(): Promise<string> {
    const inicio = this.agora();
    const resposta = objeto(await this.http.chamar(this.base + '/api/v1/auth/login', {}, this.login));
    const token = textoObrigatorio(resposta.accessToken);
    const segundos = Number(resposta.expiraEmSegundos);
    if (!Number.isFinite(segundos) || segundos <= 0) throw new Error('CRM_VALIDADE_TOKEN_INVALIDA');
    this.atual = { token, renovarEm: inicio + (segundos - Math.min(30, segundos / 10)) * 1000 };
    return token;
  }
}
