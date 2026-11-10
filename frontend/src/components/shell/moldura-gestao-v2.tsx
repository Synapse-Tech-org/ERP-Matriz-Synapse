"use client";

import type { ReactNode } from "react";

import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";
import { useTextos } from "@/lib/config/textos-provider";

import { CabecalhoListaV2 } from "./cabecalho-lista-v2";
import estilos from "./lista-v2.module.css";

export function MolduraGestaoV2({
  secao, children,
}: {
  secao: "gestao" | "campanhas" | "automacao" | "configuracoes" | "administracao" | "feedbacks";
  children: ReactNode;
}) {
  const layoutV2 = useFuncionalidadesHabilitadas().data?.includes("gestao_layout_v2") ?? false;
  const textos = useTextos();
  if (!layoutV2) return children;

  const titulo = secao === "configuracoes" ? textos.configuracoes.titulo : textos.menu.itens[secao];
  return (
    <section data-layout="v2" className={`${estilos.pagina} ${estilos.modulo} ${estilos.gestao}`}>
      <CabecalhoListaV2 titulo={titulo} />
      {children}
    </section>
  );
}
