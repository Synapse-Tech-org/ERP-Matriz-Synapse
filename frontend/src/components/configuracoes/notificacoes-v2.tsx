"use client";

import { BellRing, MessageSquareText, MessagesSquare, MonitorSmartphone, Volume2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import {
  usePreferenciaChatInternoDeNotificacao,
  usePreferenciaDuracaoDeNotificacao,
  usePreferenciaPosicaoDeNotificacao,
  usePreferenciaSomDeNotificacao,
  usePreferenciaVisualDeNotificacao,
} from "@/lib/atendimento/preferencias-notificacoes";
import { useTextos } from "@/lib/config/textos-provider";

import estilos from "./configuracoes-v2.module.css";

const DURACOES_EM_SEGUNDOS = [1, 3, 5, 8, 15, 30];
const POSICOES = ["TOPO", "BAIXO"] as const;

/** Preferências de notificação no formato do protótipo; os hooks e valores gravados são os mesmos. */
export function NotificacoesV2() {
  const t = useTextos().notificacoes;
  const som = usePreferenciaSomDeNotificacao();
  const visual = usePreferenciaVisualDeNotificacao();
  const chatInterno = usePreferenciaChatInternoDeNotificacao();
  const duracao = usePreferenciaDuracaoDeNotificacao();
  const posicao = usePreferenciaPosicaoDeNotificacao();
  const linhas = [
    { Icone: Volume2, titulo: t.somTitulo, estado: som.somHabilitado ? t.somAtivado : t.somDesativado, descricao: t.somDescricao, ligado: som.somHabilitado, definir: som.definirSomHabilitado },
    { Icone: MonitorSmartphone, titulo: t.visualTitulo, estado: visual.visualHabilitado ? t.visualAtivado : t.visualDesativado, descricao: t.visualDescricao, ligado: visual.visualHabilitado, definir: visual.definirVisualHabilitado },
    { Icone: MessagesSquare, titulo: t.chatInternoTitulo, estado: chatInterno.chatInternoHabilitado ? t.chatInternoAtivado : t.chatInternoDesativado, descricao: t.chatInternoDescricao, ligado: chatInterno.chatInternoHabilitado, definir: chatInterno.definirChatInternoHabilitado },
  ];

  return (
    <div className={estilos.dupla}>
      <section className={estilos.cartao}>
        <header className={estilos.topo}>
          <BellRing aria-hidden />
          <div>
            <h3>{t.painelCrmTitulo}</h3>
            <p>{t.painelCrmDescricao}</p>
          </div>
        </header>
        {linhas.map(({ Icone, titulo, estado, descricao, ligado, definir }) => (
          <div key={titulo} className={estilos.linha}>
            <Icone aria-hidden />
            <div className="min-w-0 flex-1">
              <strong>{estado}</strong>
              <small>{descricao}</small>
            </div>
            <Switch checked={ligado} onCheckedChange={definir} aria-label={titulo} />
          </div>
        ))}
      </section>

      <section className={estilos.cartao} data-fechado>
        <header className={estilos.topo}>
          <MessageSquareText aria-hidden />
          <div>
            <h3>{t.painelAvisosTitulo}</h3>
            <p>{t.painelAvisosDescricao}</p>
          </div>
        </header>
        <p className={estilos.rotulo} id="notificacoes-duracao">{t.duracaoTitulo}</p>
        <div role="radiogroup" aria-labelledby="notificacoes-duracao" className={estilos.segmentos}>
          {DURACOES_EM_SEGUNDOS.map((segundos) => (
            <button
              key={segundos}
              type="button"
              role="radio"
              aria-checked={duracao.duracaoSegundos === segundos}
              aria-label={t.duracaoOpcao.replace("{segundos}", String(segundos))}
              onClick={() => duracao.definirDuracaoSegundos(segundos)}
            >
              {t.duracaoCurta?.replace("{segundos}", String(segundos)) ?? segundos}
            </button>
          ))}
        </div>
        <p className={estilos.rotulo} id="notificacoes-posicao">{t.posicaoTitulo} <small>· {t.posicaoLado}</small></p>
        <div role="radiogroup" aria-labelledby="notificacoes-posicao" className={estilos.posicoes}>
          {POSICOES.map((opcao) => (
            <button key={opcao} type="button" role="radio" aria-checked={posicao.posicao === opcao} onClick={() => posicao.definirPosicao(opcao)}>
              <span className={estilos.previa} data-posicao={opcao} aria-hidden><span /></span>
              <span className={estilos.escolha}>{opcao === "TOPO" ? t.posicaoTopo : t.posicaoBaixo}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
