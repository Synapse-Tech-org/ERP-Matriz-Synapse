"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import { IconeFrontendV2 } from "@/components/shell/icone-frontend-v2";
import lista from "@/components/shell/lista-v2.module.css";
import { useCapacidades } from "@/lib/gestao/use-capacidades";
import { useTextos } from "@/lib/config/textos-provider";

import estilos from "./automacao-v2.module.css";

const GRUPOS = [
  { rotulo: "Assistente de IA", abas: ["geral", "conhecimento", "distribuicao"] },
  { rotulo: "Mensagens automáticas", abas: ["sistema", "followUp", "fidelizacao"] },
] as const;

const ABAS = {
  geral: { rotulo: "Parâmetros", titulo: "Parâmetros da IA", descricao: "Recursos de IA e ajustes técnicos do assistente.", icone: "sparkling-2-line" },
  conhecimento: { rotulo: "Base de conhecimento", titulo: "Base de conhecimento", descricao: "Informações que o assistente consulta para responder.", icone: "table-line" },
  distribuicao: { rotulo: "Distribuição", titulo: "Distribuição", descricao: "Para quem a IA transfere as conversas.", icone: "user-shared-line" },
  sistema: { rotulo: "Mensagens do sistema", titulo: "Mensagens do sistema", descricao: "Mensagens automáticas configuradas nesta instância.", icone: "chat-settings-line" },
  followUp: { rotulo: "Follow-up", titulo: "Follow-up", descricao: "Mensagens automáticas quando o lead para de responder durante uma negociação.", icone: "repeat-line" },
  fidelizacao: { rotulo: "Fidelização", titulo: "Fidelização", descricao: "Mensagens para reativar clientes sem contato e celebrar datas especiais.", icone: "heart-3-line" },
  observacoesConsultas: { icone: "calendar-line" },
} as const;

export type AbaAutomacaoV2 = keyof typeof ABAS;

export function MolduraAutomacaoV2({ aba, clinica = false, onSelecionar, resumo, children }: {
  aba: AbaAutomacaoV2;
  clinica?: boolean;
  onSelecionar: (aba: AbaAutomacaoV2) => void;
  resumo: ReactNode;
  children: ReactNode;
}) {
  const textos = useTextos();
  const capacidades = useCapacidades();
  const pagina = aba === "observacoesConsultas" ? textos.automacao.observacoesConsultas! : ABAS[aba];
  const grupoAtual = GRUPOS.find(({ abas }) => abas.some((item) => item === aba));

  return (
    <section data-layout="v2" className={lista.pagina + " " + estilos.pagina}>
      <CabecalhoListaV2 titulo={pagina.rotulo} grupo={textos.menu.grupoGestao}
        trilha={[textos.automacao.titulo, grupoAtual?.rotulo ?? ""]} busca={textos.gestao.v2.buscaGlobal} />
      <div className={estilos.grade}>
        <aside className={estilos.lateral}>
          <p className={estilos.titulo}>{textos.automacao.titulo}</p>
          {resumo}
          <nav aria-label={textos.automacao.titulo} className={estilos.menu}>
            {GRUPOS.map(({ rotulo, abas }) => (
              <div key={rotulo} className={estilos.grupo}>
                <p>{rotulo}</p>
                {abas.map((item) => (
                  <button key={item} type="button" aria-current={aba === item ? "page" : undefined}
                    onClick={() => onSelecionar(item)}>
                    <IconeFrontendV2 nome={ABAS[item].icone} />
                    {ABAS[item].rotulo}
                  </button>
                ))}
              </div>
            ))}
            {clinica && textos.automacao.observacoesConsultas && (
              <div className={estilos.grupo}>
                <button type="button" aria-current={aba === "observacoesConsultas" ? "page" : undefined}
                  onClick={() => onSelecionar("observacoesConsultas")}>
                  <IconeFrontendV2 nome={ABAS.observacoesConsultas.icone} />
                  {textos.automacao.observacoesConsultas.rotulo}
                </button>
              </div>
            )}
          </nav>
        </aside>
        <div className={estilos.conteudo}>
          <header className={estilos.cabecalho}>
            <div>
              <h1 className={estilos.titulo}>{pagina.titulo}</h1>
              <p>{pagina.descricao}</p>
            </div>
            {aba === "distribuicao" && capacidades.pode("equipe.ver") && (
              <Link href="/gestao">Ver equipe <IconeFrontendV2 nome="arrow-right-up-line" /></Link>
            )}
          </header>
          {children}
        </div>
      </div>
    </section>
  );
}
