/**
 * A lista e a ficha usam as larguras declaradas na grade da pagina de Atendimentos. A coluna da
 * conversa precisa continuar utilizavel; o ResizeObserver aplica estes cortes sobre o espaco
 * efetivo da pagina, depois da sidebar, e nao sobre window.innerWidth.
 */
const LARGURA_MINIMA_CONVERSA = 320;

export type ModoDaGrade = "ampla" | "dupla" | "unica";

export const GRADE_LEGADA = { lista: 346, ficha: 344 };
export const GRADE_V2 = { lista: 360, ficha: 340 };

export function modoDaGrade(largura: number, dimensoes = GRADE_LEGADA): ModoDaGrade {
  if (largura < dimensoes.lista + LARGURA_MINIMA_CONVERSA) return "unica";
  if (largura < dimensoes.lista + dimensoes.ficha + LARGURA_MINIMA_CONVERSA) return "dupla";
  return "ampla";
}
