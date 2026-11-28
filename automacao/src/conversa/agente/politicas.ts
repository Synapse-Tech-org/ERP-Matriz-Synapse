type Parametro = {chave?:unknown;valor?:unknown};
export function politicasConversa(parametros:Parametro[]) {
  function valor(chave:string) {
    const linhas = parametros.filter(p=>p.chave === chave);
    if (linhas.length > 1) throw new Error("PARAMETRO_DUPLICADO:"+chave);
    return linhas[0]?.valor;
  }
  function habilitada(chave:string) {
    const v = valor(chave);
    if (v === undefined || v === "false") return false;
    if (v === "true") return true;
    throw new Error("PARAMETRO_INVALIDO:"+chave);
  }
  function numero(chave:string,min:number,max:number) {
    const v = valor(chave);
    if (v === undefined) return undefined;
    if (typeof v !== "string" || !/^\d+$/.test(v) || +v<min || +v>max)
      throw new Error("PARAMETRO_INVALIDO:"+chave);
    return +v;
  }
  return {
    apresentar:habilitada("ia.comportamento.apresentar_assistente_virtual"),
    precoDaBase:habilitada("ia.comportamento.informar_precos_da_base"),
    contexto:numero("ia.contexto.mensagens",5,100),
    atraso:numero("ia.resposta.atraso_segundos",0,30),
    maxSequencia:numero("ia.resposta.max_sequencia",1,20)
  };
}
export type PoliticasConversa = ReturnType<typeof politicasConversa>;

export function instrucoesDoTurno(p:PoliticasConversa, primeiraMensagem:boolean) {
  return [
    p.apresentar && primeiraMensagem && "Apresente-se como assistente virtual nesta primeira resposta.",
    p.precoDaBase && "Quando perguntarem preço, pode informar somente faixas explícitas na FAQ ativa. Não faça orçamento nem estime valores."
  ].filter(Boolean).join("\n");
}
