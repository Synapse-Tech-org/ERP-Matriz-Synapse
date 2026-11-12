"use client";

import { useSyncExternalStore } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";

const EVENTO = "synapse:enter-envia";
const chave = (id: string) => EVENTO + ":" + id;

export function enterEnviaMensagem(id = useAuthStore.getState().usuarioId) {
  try {
    return !id || window.localStorage.getItem(chave(id)) !== "false";
  } catch {
    return true;
  }
}

function observar(atualizar: () => void) {
  window.addEventListener(EVENTO, atualizar);
  window.addEventListener("storage", atualizar);
  return () => {
    window.removeEventListener(EVENTO, atualizar);
    window.removeEventListener("storage", atualizar);
  };
}

export function useEnterEnviaMensagem() {
  const id = useAuthStore((estado) => estado.usuarioId);
  const ativo = useSyncExternalStore(observar, () => enterEnviaMensagem(id), () => true);
  function definir(valor: boolean) {
    if (!id) return;
    window.localStorage.setItem(chave(id), String(valor));
    window.dispatchEvent(new Event(EVENTO));
  }
  return { ativo, definir };
}
