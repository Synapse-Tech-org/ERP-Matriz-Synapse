"use client";

import { useSyncExternalStore } from "react";

import { useAuthStore } from "@/lib/auth/auth-store";

const EVENTO = "synapse:densidade-listas";

function observar(atualizar: () => void) {
  window.addEventListener(EVENTO, atualizar);
  window.addEventListener("storage", atualizar);
  return () => {
    window.removeEventListener(EVENTO, atualizar);
    window.removeEventListener("storage", atualizar);
  };
}

export function useDensidadeDasListas() {
  const usuario = useAuthStore((estado) => estado.usuarioId);
  const chave = usuario ? EVENTO + ":" + usuario : null;
  const compacta = useSyncExternalStore(observar, () => {
    try {
      return chave !== null && window.localStorage.getItem(chave) === "compacta";
    } catch {
      return false;
    }
  }, () => false);

  function definir(valor: boolean) {
    if (!chave) return;
    window.localStorage.setItem(chave, valor ? "compacta" : "confortavel");
    window.dispatchEvent(new Event(EVENTO));
  }

  return { compacta, definir };
}
