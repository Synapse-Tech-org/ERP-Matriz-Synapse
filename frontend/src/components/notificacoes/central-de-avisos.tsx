"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { useCentralDeAvisos } from "@/lib/atendimento/central-de-avisos";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useTextos } from "@/lib/config/textos-provider";
import { useMinhasPermissoes } from "@/lib/gestao/use-gestao";

import { IconeFrontendV2 } from "@/components/shell/icone-frontend-v2";

const FILTROS = ["todas", "naoLidas", "atendimentos", "chatInterno"] as const;

export function CentralDeAvisos({ mostrarContagem = false }: { mostrarContagem?: boolean }) {
  const catalogo = useTextos();
  const usuarioId = useAuthStore((estado) => estado.usuarioId);
  const { data: permissoes } = useMinhasPermissoes();
  const dono = useCentralDeAvisos((estado) => estado.usuarioId);
  const avisosDaSessao = useCentralDeAvisos((estado) => estado.avisos);
  const marcarLidos = useCentralDeAvisos((estado) => estado.marcarLidos);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("todas");
  const [aberto, setAberto] = useState(false);
  if (!usuarioId) return null;

  const textos = catalogo.dashboard.v2.centralAvisos;
  const permiteClientes = permissoes?.capacidades["clientes.acessar"]?.permitido === true;
  const avisos = dono === usuarioId
    ? avisosDaSessao.filter((aviso) => permiteClientes || aviso.origem === "chatInterno")
    : [];
  const naoLidos = avisos.filter((aviso) => !aviso.lido).length;
  const visiveis = avisos.filter((aviso) =>
    filtro === "todas" || (filtro === "naoLidas" ? !aviso.lido : aviso.origem === filtro));

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger data-slot="dashboard-sino" aria-label={textos.titulo} title={textos.titulo}>
        <IconeFrontendV2 nome="notification-3-line" />
        {naoLidos > 0 && (
          <span data-slot={mostrarContagem ? "sino-contagem" : "dashboard-sino-ponto"} aria-hidden="true">
            {mostrarContagem ? naoLidos : null}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(412px,calc(100vw-2rem))] gap-0 overflow-hidden rounded-2xl p-0">
        <div className="flex items-center justify-between gap-2 border-b p-4">
          <PopoverTitle>{textos.titulo}</PopoverTitle>
          <Button type="button" size="sm" variant="outline" disabled={naoLidos === 0} onClick={() => marcarLidos()}>
            {textos.marcarLidas}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1 border-b px-3 py-2" role="group" aria-label={textos.titulo}>
          {FILTROS.map((item) => (
            <Button key={item} size="sm" variant={item === filtro ? "secondary" : "outline"}
              aria-pressed={item === filtro} onClick={() => setFiltro(item)}>
              {textos[item]}
            </Button>
          ))}
        </div>
        {visiveis.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{textos.vazio}</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto p-2">
            {visiveis.map((aviso) => (
              <li key={aviso.id}>
                <Link href={aviso.href} prefetch={false} onClick={() => { marcarLidos(aviso.id); setAberto(false); }}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                  <span className={aviso.lido ? undefined : "font-semibold"}>{aviso.titulo}</span>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={new Date(aviso.recebidoEm).toISOString()}>
                    {new Date(aviso.recebidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/configuracoes" onClick={() => setAberto(false)} className="border-t bg-muted/50 px-4 py-3 text-sm text-primary hover:underline">
          {textos.preferencias}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
