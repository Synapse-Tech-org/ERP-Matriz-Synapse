export interface CampoPerfil { rotulo:string; limite:number; opcoes?:readonly string[] }
export const camposPerfil:Readonly<Record<string,CampoPerfil>> = Object.freeze({
  "ia.perfil.nome": {rotulo:"Nome da assistente",limite:100},
  "ia.perfil.instrucoes": {rotulo:"Instruções de personalidade",limite:4000},
  "ia.perfil.tom": {rotulo:"Tom de voz",limite:20,opcoes:["Formal","Equilibrado","Próximo"]},
  "ia.perfil.tamanho": {rotulo:"Tamanho das respostas",limite:20,opcoes:["Curtas","Médias","Detalhadas"]},
});

export function validarPerfil(chave:string, valor:string) {
  const campo = camposPerfil[chave];
  return !!campo && valor.length <= campo.limite && (!valor || !campo.opcoes || campo.opcoes.includes(valor));
}

export function instrucoesPerfil(parametros:readonly {chave:string;valor:string}[]) {
  const linhas:string[] = [];
  for (const {chave,valor} of parametros) {
    if (!Object.hasOwn(camposPerfil,chave) || !valor) continue;
    if (!validarPerfil(chave,valor)) throw new Error("PERFIL_INVALIDO:"+chave);
    linhas.push(camposPerfil[chave]!.rotulo+": "+valor);
  }
  return linhas.join("\n");
}
