import { randomBytes } from "node:crypto";
import {
  FalhaIdentidade,
  type ProvedorIdentidade,
  type UsuarioPainel,
} from "./identidade.js";

interface Sessao {
  token: string;
  usuario: UsuarioPainel;
  expiraEm: number;
  verificarEm: number;
}
export class SessoesPainel {
  private readonly sessoes = new Map<string, Sessao>();
  constructor(
    private readonly identidade: ProvedorIdentidade,
    private readonly agora: () => number = Date.now,
  ) {}
  async entrar(
    email: string,
    senha: string,
  ): Promise<{ id: string; usuario: UsuarioPainel; validadeSegundos: number }> {
    for (const [id, s] of this.sessoes)
      if (s.expiraEm <= this.agora()) this.sessoes.delete(id);
    if (this.sessoes.size >= 100)
      throw new FalhaIdentidade("LIMITE_DE_SESSOES", 503);
    const login = await this.identidade.autenticar(email, senha);
    if (this.sessoes.size >= 100)
      throw new FalhaIdentidade("LIMITE_DE_SESSOES", 503);
    const id = randomBytes(32).toString("hex");
    this.sessoes.set(id, {
      token: login.token,
      usuario: login.usuario,
      expiraEm: this.agora() + login.validadeSegundos * 1000,
      verificarEm: this.agora() + 30000,
    });
    return {
      id,
      usuario: login.usuario,
      validadeSegundos: login.validadeSegundos,
    };
  }
  async consultar(id: string | undefined): Promise<UsuarioPainel> {
    const sessao = id ? this.sessoes.get(id) : undefined;
    if (!sessao || sessao.expiraEm <= this.agora()) {
      if (id) this.sessoes.delete(id);
      throw new FalhaIdentidade("SESSAO_EXPIRADA", 401);
    }
    if (sessao.verificarEm <= this.agora()) {
      try {
        sessao.usuario = await this.identidade.validar(sessao.token);
        sessao.verificarEm = this.agora() + 30000;
      } catch (error) {
        if (error instanceof FalhaIdentidade && error.status !== 503)
          this.sessoes.delete(id!);
        throw error;
      }
    }
    return sessao.usuario;
  }
  sair(id: string | undefined): void {
    if (id) this.sessoes.delete(id);
  }
  limpar(): void {
    this.sessoes.clear();
  }
}
