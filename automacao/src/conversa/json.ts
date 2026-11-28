export function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? valor as Record<string, unknown> : {};
}

export function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() && !valor.includes('\0') ? valor : null;
}

export function telefone(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[1-9]\d{7,14}$/.test(valor);
}

export function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}
