/**
 * Protege apenas saidas TypeScript, sem ler flags globais do CRM.
 * Lista vazia bloqueia todos; entrada invalida impede iniciar o executor.
 */
export function carregarRestricaoNumeros(env: NodeJS.ProcessEnv) {
  const flag = env.AUTOMACAO_RESTRICAO_NUMEROS_HABILITADA ?? "true";
  if (flag !== "true" && flag !== "false") throw new Error("RESTRICAO_AUTOMACAO_INVALIDA");
  const lista = (env.AUTOMACAO_NUMEROS_TESTE ?? "").trim();
  const numeros = lista ? lista.split(",").map(n => n.trim()) : [];
  if (numeros.some(n => !/^[1-9]\d{7,14}$/.test(n)))
    throw new Error("NUMEROS_TESTE_AUTOMACAO_INVALIDOS");
  return { habilitada: flag === "true", numeros: [...new Set(numeros)] };
}
