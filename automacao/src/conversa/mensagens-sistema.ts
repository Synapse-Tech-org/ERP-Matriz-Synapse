// Este contrato e interno: o adaptador do CRM traduz seu formato de persistencia.
export interface CadastroMensagem {
  ativa: boolean;
  texto: string;
  atrasoMinutos?: number;
  formatoAvaliacao?: "BOTOES" | "NOTA_1_A_10";
}
export interface CatalogoMensagensCrm {
  consultar(evento: string): Promise<CadastroMensagem | null>;
}

export async function prepararMensagemSistema(catalogo: CatalogoMensagensCrm, evento: string,
  variaveis: Readonly<Record<string,string>>) {
  const cadastro = await catalogo.consultar(evento);
  if (!cadastro || !cadastro.ativa) return null;
  if (!cadastro.texto.trim()) throw new Error("MENSAGEM_SISTEMA_SEM_TEXTO");
  // Uma unica passagem: nomes recebidos do cliente nao viram novos marcadores.
  const texto = cadastro.texto.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, chave:string) => {
    if (!Object.hasOwn(variaveis,chave) || !variaveis[chave]?.trim())
      throw new Error("MENSAGEM_SISTEMA_VARIAVEL_AUSENTE:" + chave);
    return variaveis[chave]!;
  });
  return {...cadastro,texto};
}
