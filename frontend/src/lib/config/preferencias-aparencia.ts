"use client";

import { useSyncExternalStore } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";

export const temas = ["claro", "escuro", "sistema"] as const;
export const cores = ["azul", "indigo", "petroleo", "verde", "ambar"] as const;
export const tamanhos = ["compacto", "padrao", "grande"] as const;

const evento = "synapse:aparencia";
const mediaEscuro = "(prefers-color-scheme: dark)";

function observar(atualizar: () => void) {
  window.addEventListener(evento, atualizar);
  window.addEventListener("storage", atualizar);
  return () => {
    window.removeEventListener(evento, atualizar);
    window.removeEventListener("storage", atualizar);
  };
}

function observarSistema(atualizar: () => void) {
  const media = window.matchMedia?.(mediaEscuro);
  media?.addEventListener?.("change", atualizar);
  return () => media?.removeEventListener?.("change", atualizar);
}

function usePreferencia<T extends string>(nome: string, opcoes: readonly T[], padrao: T) {
  const usuario = useAuthStore((estado) => estado.usuarioId);
  const chave = usuario ? evento + ":" + usuario + ":" + nome : null;
  const valor = useSyncExternalStore(observar, () => {
    try {
      const gravado = chave ? window.localStorage.getItem(chave) : null;
      return opcoes.find((opcao) => opcao === gravado) ?? padrao;
    } catch {
      return padrao;
    }
  }, () => padrao);

  function definir(proximo: T) {
    if (!chave) return;
    window.localStorage.setItem(chave, proximo);
    window.dispatchEvent(new Event(evento));
  }

  return { valor, definir };
}

export function usePreferenciasAparencia() {
  const tema = usePreferencia("tema", temas, "claro");
  const cor = usePreferencia("cor", cores, "azul");
  const tamanho = usePreferencia("tamanho", tamanhos, "padrao");
  const sistemaEscuro = useSyncExternalStore(
    observarSistema,
    () => window.matchMedia?.(mediaEscuro).matches ?? false,
    () => false,
  );

  return { tema, cor, tamanho, escuro: tema.valor === "escuro" || (tema.valor === "sistema" && sistemaEscuro) };
}
