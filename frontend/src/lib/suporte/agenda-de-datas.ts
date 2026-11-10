export function chaveDoDiaLocal(valor: string | Date): string {
  const data = new Date(valor);
  return [data.getFullYear(), data.getMonth() + 1, data.getDate()]
    .map((parte) => String(parte).padStart(2, "0")).join("-");
}

export function periodoLocal(inicio: string, fim: string) {
  return {
    inicio: inicio ? new Date(inicio + "T00:00:00").toISOString() : undefined,
    fim: fim ? new Date(fim + "T23:59:59.999").toISOString() : undefined,
  };
}
