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

export function horariosDeAdiamento(agora: number) {
  const amanha = new Date(agora);
  amanha.setDate(amanha.getDate() + 1);
  amanha.setHours(9, 0, 0, 0);
  const segunda = new Date(agora);
  segunda.setDate(segunda.getDate() + ((8 - segunda.getDay()) % 7 || 7));
  segunda.setHours(8, 0, 0, 0);
  return { hora: new Date(agora + 3_600_000), amanha, segunda };
}

export function horaLocal(data: Date | string) {
  return new Date(data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
