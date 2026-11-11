import type { RegraFollowup, RegrasDaRodada } from "./contratos.js";
import {
  CHAVES_CRM_FOLLOWUP as CHAVES,
  PADROES_FOLLOWUP as PADROES,
} from "./padroes.js";
import { objeto, textoObrigatorio } from "./http.js";

export interface OpcoesRegras {
  botaoSimId?: string;
  botaoNaoId?: string;
  teste?: { leadId: string; regra: RegraFollowup };
  exigeJanela: boolean;
}

export function lerRegrasCrm(
  configBruta: unknown,
  regrasBrutas: unknown,
  opcoes: OpcoesRegras,
): RegrasDaRodada {
  const config = objeto(configBruta);
  if (
    !Array.isArray(config.parametros) ||
    !Array.isArray(regrasBrutas) ||
    typeof config.exigeTemplateForaDaJanela !== "boolean"
  ) {
    throw new Error("CONTRATO_CONFIGURACAO_CRM_INVALIDO");
  }
  const parametros = new Map<string, unknown>();
  for (const item of config.parametros) {
    const p = objeto(item),
      chave = textoObrigatorio(p.chave);
    if (parametros.has(chave)) throw new Error("PARAMETRO_CRM_DUPLICADO");
    parametros.set(chave, p.valor);
  }
  const padroesUtilizados: string[] = [];
  function valor(chave: string, padrao: string | number): string | number {
    const dado = parametros.get(chave);
    if (
      dado === undefined ||
      dado === null ||
      (typeof dado === "string" && !dado.trim())
    ) {
      padroesUtilizados.push(chave);
      return padrao;
    }
    if (typeof dado !== "string" && typeof dado !== "number")
      throw new Error("PARAMETRO_CRM_INVALIDO: " + chave);
    return dado;
  }
  function numero(chave: string, padrao: number, maximo: number): number {
    const dado = String(valor(chave, padrao)).trim();
    if (!/^\d+$/.test(dado) || Number(dado) > maximo)
      throw new Error("PARAMETRO_CRM_INVALIDO: " + chave);
    return Number(dado);
  }
  const regras = regrasBrutas.map((item) => {
    const r = objeto(item);
    if (!Number.isInteger(r.tempoMinutos) || Number(r.tempoMinutos) <= 0)
      throw new Error("REGRA_CRM_INVALIDA");
    return {
      id: textoObrigatorio(r.id),
      nome: textoObrigatorio(r.nome),
      tempoMinutos: Number(r.tempoMinutos),
      texto: textoObrigatorio(r.texto),
    };
  });
  if (new Set(regras.map((r) => r.id)).size !== regras.length)
    throw new Error("REGRA_CRM_DUPLICADA");
  const botoes = [
    {
      id:
        opcoes.botaoSimId ||
        String(valor(CHAVES.botaoSimId, PADROES.botaoSimId)),
      titulo: String(valor(CHAVES.botaoSimTitulo, PADROES.botaoSimTitulo)),
    },
    {
      id:
        opcoes.botaoNaoId ||
        String(valor(CHAVES.botaoNaoId, PADROES.botaoNaoId)),
      titulo: String(valor(CHAVES.botaoNaoTitulo, PADROES.botaoNaoTitulo)),
    },
  ];
  if (
    botoes[0]!.id === botoes[1]!.id ||
    botoes.some((b) => b.titulo.length > 20 || b.id.length > 100)
  )
    throw new Error("BOTOES_INVALIDOS");
  const teste = regras.length === 0 ? opcoes.teste : undefined;
  if (teste) padroesUtilizados.push("REGRA_LOCAL_RESTRITA_A_LEAD_TESTE");
  return {
    regras: teste ? [teste.regra] : regras,
    limiteEnvios: numero(CHAVES.limiteEnvios, PADROES.limiteEnvios, 10000),
    encerrarAposMinutos: numero(
      CHAVES.encerrarAposMinutos,
      PADROES.encerrarAposMinutos,
      525600,
    ),
    janelaLivreMinutos: Math.min(
      1430,
      numero(CHAVES.janelaLivreMinutos, PADROES.janelaLivreMinutos, 1440),
    ),
    // Meta nunca permite ampliar sua janela porque o CRM veio mal configurado.
    exigeJanela: opcoes.exigeJanela || config.exigeTemplateForaDaJanela,
    botoes,
    padroesUtilizados,
    ...(teste ? { leadTeste: teste.leadId } : {}),
  };
}
