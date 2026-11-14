"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, UserRoundPlus, UsersRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { useAuthStore } from "@/lib/auth/auth-store";
import { avisarAlteracaoDeConta, comSessaoExclusiva } from "@/lib/auth/sessao-navegador";
import { useTextos } from "@/lib/config/textos-provider";

interface Conta {
  id: string;
  nome: string;
  papel: string;
}

const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium hover:bg-muted";

export function SeletorDeContas() {
  const t = useTextos().rodape;
  const usuarioId = useAuthStore((estado) => estado.usuarioId);
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [erro, setErro] = useState(false);
  const contas = useQuery({
    queryKey: ["contas-do-navegador", usuarioId],
    enabled: aberto,
    retry: false,
    queryFn: async (): Promise<Conta[]> => {
      const resposta = await fetch("/api/auth/contas", { cache: "no-store" });
      if (!resposta.ok) throw new Error();
      return resposta.json();
    },
  });

  async function trocar(id: string) {
    setTrocando(true);
    setErro(false);
    try {
      const resposta = await comSessaoExclusiva(() => fetch("/api/auth/contas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }));
      if (!resposta.ok) {
        if (resposta.status === 401 || resposta.status === 404) void contas.refetch();
        throw new Error();
      }
      useAuthStore.getState().limparSessao();
      avisarAlteracaoDeConta();
      window.location.replace("/");
    } catch {
      setErro(true);
      setTrocando(false);
    }
  }

  return (
    <div className="border-y border-border py-1">
      <button type="button" className={item} aria-expanded={aberto} disabled={trocando}
        onClick={() => setAberto(!aberto)}>
        <UsersRound className="size-4" aria-hidden />
        <span className="flex-1">{t.trocarConta}</span>
        <ChevronDown aria-hidden className={aberto ? "size-3 rotate-180" : "size-3"} />
      </button>
      {aberto && <div className="mt-1">
        {contas.data?.map((conta) => (
          <button type="button" key={conta.id} className={item} onClick={() => void trocar(conta.id)} disabled={trocando}>
            <AvatarIniciais id={conta.id} nome={conta.nome}
              className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" />
            <span className="min-w-0">
              <span className="block truncate">{conta.nome}</span>
              <span className="block truncate text-xs text-muted-foreground">{conta.papel}</span>
            </span>
          </button>
        ))}
        {(erro || contas.isError) && <p role="alert" className="px-2.5 text-xs text-destructive">{t.erroTrocarConta}</p>}
        {contas.isFetching && <p role="status" className="px-2.5 text-xs text-muted-foreground">{t.carregandoContas}</p>}
        <Link href="/login" className={item}><UserRoundPlus className="size-4" aria-hidden />{t.adicionarConta}</Link>
      </div>}
    </div>
  );
}
