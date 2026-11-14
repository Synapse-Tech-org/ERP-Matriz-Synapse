import { create } from "zustand";

type Aviso = {
  id: string;
  titulo: string;
  href: string;
  origem: "atendimentos" | "chatInterno";
  recebidoEm: number;
};

interface CentralDeAvisos {
  usuarioId: string | null;
  avisos: Array<Aviso & { lido: boolean }>;
  receber: (usuarioId: string, aviso: Aviso) => void;
  marcarLidos: (id?: string) => void;
  limpar: () => void;
}

const MAXIMO_DE_AVISOS_RECENTES = 20;

/** Histórico da sessão, alimentado pela mesma assinatura dos avisos visuais. */
export const useCentralDeAvisos = create<CentralDeAvisos>((set) => ({
  usuarioId: null,
  avisos: [],
  receber: (usuarioId, aviso) => set((estado) => {
    const atuais = estado.usuarioId === usuarioId ? estado.avisos : [];
    if (atuais.some((item) => item.id === aviso.id)) return estado;
    return {
      usuarioId,
      avisos: [{ ...aviso, lido: false }, ...atuais].slice(0, MAXIMO_DE_AVISOS_RECENTES),
    };
  }),
  marcarLidos: (id) => set((estado) => ({
    avisos: estado.avisos.map((aviso) => id === undefined || id === aviso.id ? { ...aviso, lido: true } : aviso),
  })),
  limpar: () => set({ usuarioId: null, avisos: [] }),
}));
