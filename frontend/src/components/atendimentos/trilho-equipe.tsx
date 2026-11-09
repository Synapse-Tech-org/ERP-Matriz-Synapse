"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageCircleMore, Plus } from "lucide-react";

import { DialogoSelecionarPessoa } from "@/components/chat-interno/dialogo-selecionar-pessoa";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import type { ChatContato } from "@/lib/chat-interno/types";
import { useTextos } from "@/lib/config/textos-provider";

interface Props {
  contatos: ChatContato[];
  carregando: boolean;
  erro: boolean;
  abrindo: boolean;
  onRecarregar: () => void;
  onAbrir: (id: string) => Promise<unknown>;
}

export function TrilhoEquipe({ contatos, carregando, erro, abrindo, onRecarregar, onAbrir }: Props) {
  const textos = useTextos().chatInterno;
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const presencas = { ONLINE: textos.online, AUSENTE: textos.ausente, OFFLINE: textos.offline };

  async function abrir(id: string) {
    setFalhou(false);
    try {
      await onAbrir(id);
    } catch {
      setFalhou(true);
    }
  }

  return (
    <aside data-slot="trilho-equipe" aria-label={textos.titulo}>
      <Link href="/chat-interno" data-slot="trilho-equipe-chat" aria-label={textos.titulo} title={textos.titulo}>
        <MessageCircleMore aria-hidden className="size-5" />
      </Link>
      <ul data-slot="trilho-equipe-contatos">
        {contatos.map(({ id, nome, presenca }) => (
          <li key={id}>
            <button type="button" data-slot="trilho-equipe-pessoa" disabled={abrindo}
              onClick={() => void abrir(id)} aria-label={`${nome}, ${presencas[presenca]}`} title={`${nome}, ${presencas[presenca]}`}>
              <AvatarIniciais id={id} nome={nome} className="flex size-full items-center justify-center rounded-full text-sm font-bold text-white" />
              <span data-presenca={presenca} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {falhou && <p role="alert" className="sr-only">{textos.erroAbrirConversa}</p>}
      <button type="button" data-slot="trilho-equipe-adicionar" disabled={abrindo}
        aria-label={textos.novaConversa} title={textos.novaConversa} onClick={() => setSeletorAberto(true)}>
        <Plus aria-hidden className="size-5" />
      </button>
      <DialogoSelecionarPessoa aberto={seletorAberto} onFechar={() => setSeletorAberto(false)}
        contatos={contatos} carregando={carregando} erro={erro} onTentarNovamente={onRecarregar}
        onSelecionar={onAbrir} textos={textos} />
    </aside>
  );
}
