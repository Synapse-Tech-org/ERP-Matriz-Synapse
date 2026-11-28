export const chavesPrompt = {
  global: "conversa.ia.prompt.global",
  router: "conversa.ia.prompt.router",
  institucional: "conversa.ia.prompt.institucional",
  triagem: "conversa.ia.prompt.triagem",
  contexto: "conversa.ia.prompt.contexto",
  contextoInstitucional: "conversa.ia.prompt.contexto_institucional",
} as const;

export interface Parametro { chave: string; valor: string }
export function lerPrompts(parametros: Parametro[]) {
  const ler = (chave: string) => {
    const valores = parametros.filter(p => p.chave === chave);
    if (valores.length !== 1 || !valores[0]?.valor?.trim())
      throw new Error("PROMPT_NAO_CONFIGURADO:" + chave);
    return valores[0].valor;
  };
  return { global: ler(chavesPrompt.global), router: ler(chavesPrompt.router),
    institucional: ler(chavesPrompt.institucional), triagem: ler(chavesPrompt.triagem),
    contexto: ler(chavesPrompt.contexto), contextoInstitucional: ler(chavesPrompt.contextoInstitucional) };
}

// O template e editavel, mas nao executa JavaScript nem expressoes n8n.
export function preencherContexto(template: string, dados: Record<string, unknown>) {
  if (!template.trim()) throw new Error("CONTEXTO_VAZIO");
  return template.replace(/\{\{([\s\S]*?)\}\}/g, (_, expressao: string) => {
    const chave = expressao.trim();
    if (!Object.hasOwn(dados, chave) || dados[chave] === undefined)
      throw new Error("VARIAVEL_DE_CONTEXTO_INVALIDA");
    const valor = dados[chave];
    return typeof valor === "string" ? valor : JSON.stringify(valor);
  });
}
