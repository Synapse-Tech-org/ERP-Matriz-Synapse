"use client";

const CHAVE = "synapse:conta-alterada";

export async function comSessaoExclusiva<T>(acao: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request(CHAVE, acao) : acao();
}

export function avisarAlteracaoDeConta() {
  try {
    localStorage.setItem(CHAVE, crypto.randomUUID());
  } catch {
    // A aba atual ainda troca de sessão por navegação completa.
  }
}

export function observarAlteracaoDeConta(recarregar: () => void) {
  function tratar(evento: StorageEvent) {
    if (evento.key === CHAVE) recarregar();
  }
  window.addEventListener("storage", tratar);
  return () => window.removeEventListener("storage", tratar);
}
