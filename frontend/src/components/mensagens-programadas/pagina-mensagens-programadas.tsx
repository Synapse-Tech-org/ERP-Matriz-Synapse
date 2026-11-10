"use client";

import { OpcoesListaV2 } from "@/components/shell/opcoes-lista-v2";
import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import listaV2 from "@/components/shell/lista-v2.module.css";
import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";


import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Clock3, X } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button } from "@/components/ui/button";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { PillDeStatus } from "@/components/ui/pill-de-status";
import type { TomDePill } from "@/components/ui/pill-de-status";
import { Seletor } from "@/components/ui/seletor";
import { SeletorData } from "@/components/ui/seletor-data";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useTextos } from "@/lib/config/textos-provider";
import { useEquipe } from "@/lib/equipe/use-equipe";
import { chaveDoDiaLocal, periodoLocal } from "@/lib/suporte/agenda-de-datas";
import { cancelarMensagemProgramada, listarMensagensProgramadas } from "@/lib/suporte/api";
import type { MensagemProgramada, StatusMensagemProgramada } from "@/lib/suporte/types";

import { useCapacidades } from "@/lib/gestao/use-capacidades";

import { FormularioMensagemProgramada } from "./formulario-mensagem-programada";

const TOM_DO_STATUS: Record<StatusMensagemProgramada, TomDePill> = {
  AGENDADA: "atencao",
  ENVIADA: "sucesso",
  CANCELADA: "neutro",
};

export function PaginaMensagensProgramadas() {
  const layoutV2 = useFuncionalidadesHabilitadas().data?.includes("recursos_layout_v2") ?? false;
  const t = useTextos().mensagensProgramadas;
  // Só apresentação: coluna de atendente para quem enxerga as mensagens da equipe.
  const gestor = ["SUBGESTOR", "GESTOR", "ADMINISTRADOR"].includes(useAuthStore((s) => s.papel) ?? "");
  const capacidades = useCapacidades();
  const podeCriar = capacidades.pode("mensagens_programadas.criar");
  const podeEditarCancelar = capacidades.pode("mensagens_programadas.editar_cancelar");
  const podeFiltrarEquipe = layoutV2 && gestor && capacidades.pode("equipe.ver");
  const equipe = useEquipe(podeFiltrarEquipe);
  const cache = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [edicao, setEdicao] = useState<MensagemProgramada | null>(null);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [statusSelecionado, setStatus] = useState<StatusMensagemProgramada | "" | null>(null);
  const status = statusSelecionado ?? (layoutV2 ? "AGENDADA" : "");
  const [atendente, setAtendente] = useState("");
  const [pagina, setPagina] = useState(0);

  const periodoValido = !inicio || !fim || inicio <= fim;
  const atendenteId = podeFiltrarEquipe ? atendente || undefined : undefined;
  const consulta = useQuery({
    queryKey: ["mensagens-programadas", inicio, fim, status, pagina, atendenteId],
    enabled: periodoValido,
    queryFn: () =>
      listarMensagensProgramadas({
        ...periodoLocal(inicio, fim),
        atendenteId,
        status: status || undefined,
        pagina,
      }),
  });
  const proximo = useQuery({
    queryKey: ["mensagens-programadas", "proximo", inicio, fim, atendenteId],
    enabled: layoutV2 && periodoValido,
    queryFn: async () => {
      const periodo = periodoLocal(inicio, fim);
      const agora = new Date().toISOString();
      if (periodo.fim && periodo.fim < agora) return null;
      const agendadas = await listarMensagensProgramadas({
        ...periodo, inicio: periodo.inicio && periodo.inicio > agora ? periodo.inicio : agora,
        status: "AGENDADA", atendenteId, pagina: 0,
      });
      return agendadas.mensagens[0] ?? null;
    },
  });
  const dataProximoEnvio = proximo.data?.dataEnvio;
  useEffect(() => {
    if (!layoutV2 || !dataProximoEnvio) return;
    const espera = Math.max(0, Date.parse(dataProximoEnvio) - Date.now()) + 1_000;
    if (espera > 2_147_483_647) return;
    const timer = window.setTimeout(() => {
      void cache.invalidateQueries({ queryKey: ["mensagens-programadas", "proximo"] });
    }, espera);
    return () => window.clearTimeout(timer);
  }, [cache, dataProximoEnvio, layoutV2]);

  const cancelar = useMutation({
    mutationFn: cancelarMensagemProgramada,
    onSuccess: () => cache.invalidateQueries({ queryKey: ["mensagens-programadas"] }),
  });

  function mudarFiltro(atualizar: () => void) {
    atualizar();
    setPagina(0);
  }

  return (
    <div data-layout={layoutV2 ? "v2" : "legado"} className={layoutV2 ? `${listaV2.pagina} ${listaV2.modulo}` : "space-y-5 p-6"}>
      {layoutV2 && <CabecalhoListaV2 titulo={t.titulo} />}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t.titulo}</h1>
          <p className="text-sm text-muted-foreground">{t.descricao}</p>
        </div>
        {podeCriar && <Button onClick={() => setNovo(true)}>{t.nova}</Button>}
      </header>

      {layoutV2 && <OpcoesListaV2<StatusMensagemProgramada | ""> rotulo={t.filtros.status} valor={status}
        onChange={(valor) => mudarFiltro(() => setStatus(valor))}
        opcoes={[
          { valor: "", rotulo: t.filtros.todos },
          { valor: "AGENDADA", rotulo: t.status.agendada },
          { valor: "ENVIADA", rotulo: t.status.enviada },
          { valor: "CANCELADA", rotulo: t.status.cancelada },
        ]} />}
      <div data-slot="recursos-painel" className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        {podeFiltrarEquipe && Boolean(equipe.data?.length) && <Seletor
          ariaLabel={t.colunas.atendente} placeholder={t.v2.todosAtendentes} className="w-auto max-w-full"
          valor={atendente} opcoes={(equipe.data ?? []).map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
          onChange={(valor) => mudarFiltro(() => setAtendente(valor))} />}
        <label className="text-sm">
          {t.filtros.inicio}
          <SeletorData
            valor={inicio}
            placeholder={t.filtros.inicio}
            onChange={(valor) => mudarFiltro(() => setInicio(valor))}
          />
        </label>
        <label className="text-sm">
          {t.filtros.fim}
          <SeletorData
            valor={fim}
            placeholder={t.filtros.fim}
            onChange={(valor) => mudarFiltro(() => setFim(valor))}
          />
        </label>
        {!layoutV2 && <label className="text-sm">
          {t.filtros.status}
          <Seletor
            className="ml-2"
            valor={status}
            placeholder={t.filtros.todos}
            opcoes={[
              { valor: "AGENDADA", rotulo: t.status.agendada },
              { valor: "ENVIADA", rotulo: t.status.enviada },
              { valor: "CANCELADA", rotulo: t.status.cancelada },
            ]}
            onChange={(valor) =>
              mudarFiltro(() => setStatus(valor as StatusMensagemProgramada | ""))
            }
          />
        </label>}
      </div>

      {layoutV2 && periodoValido && proximo.data && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <Clock3 aria-hidden className="size-4 text-primary" />
        <span className="text-muted-foreground">{t.v2.proximoEnvio}</span>
        <time dateTime={proximo.data.dataEnvio} className="font-semibold">{new Date(proximo.data.dataEnvio).toLocaleString("pt-BR")}</time>
        <span className="break-words font-medium">{proximo.data.leadNome}</span>
      </div>}
      {!periodoValido ? <p role="status">{t.v2?.periodoInvalido ?? t.vazio}</p> : consulta.isLoading ? (
        <p>{t.carregando}</p>
      ) : consulta.isError ? (
        <ErroDeCarregamento mensagem={t.erro} onTentarNovamente={() => consulta.refetch()} />
      ) : !consulta.data?.mensagens.length ? (
        <p className="text-muted-foreground">{t.vazio}</p>
      ) : (
        <TabelaDeMensagensProgramadas
          itens={consulta.data.mensagens}
          mostrarAtendente={gestor}
          agrupar={layoutV2}
          cancelando={cancelar.isPending}
          textos={t}
          onEditar={podeEditarCancelar ? setEdicao : undefined}
          onCancelar={podeEditarCancelar ? (id) => cancelar.mutate(id) : undefined}
        />
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={!pagina} onClick={() => setPagina((p) => p - 1)}>
          {t.paginacao.anterior}
        </Button>
        <Button
          variant="outline"
          disabled={!consulta.data?.temMais}
          onClick={() => setPagina((p) => p + 1)}
        >
          {t.paginacao.proxima}
        </Button>
      </div>

      <FormularioMensagemProgramada
        key={novo ? "novo-aberto" : "novo-fechado"}
        aberto={novo && podeCriar}
        onFechar={() => setNovo(false)}
      />
      {edicao && podeEditarCancelar && (
        <FormularioMensagemProgramada
          key={edicao.id}
          aberto
          existente={edicao}
          onFechar={() => setEdicao(null)}
        />
      )}
    </div>
  );
}

type TextosMensagensProgramadas = ReturnType<typeof useTextos>["mensagensProgramadas"];

function TabelaDeMensagensProgramadas({
  itens,
  mostrarAtendente,
  textos,
  onEditar,
  onCancelar,
  agrupar,
  cancelando,
}: {
  itens: MensagemProgramada[];
  mostrarAtendente: boolean;
  textos: TextosMensagensProgramadas;
  onEditar?: (mensagem: MensagemProgramada) => void;
  onCancelar?: (id: string) => void;
  agrupar: boolean;
  cancelando: boolean;
}) {
  const dias = new Map<string, MensagemProgramada[]>();
  for (const mensagem of itens) {
    const dia = agrupar ? chaveDoDiaLocal(mensagem.dataEnvio) : "";
    const grupo = dias.get(dia);
    if (grupo) grupo.push(mensagem);
    else dias.set(dia, [mensagem]);
  }
  return (
    <div data-slot="recursos-painel" className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/60">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.lead}
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.conteudo}
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.data}
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.status}
            </th>
            {mostrarAtendente && (
              <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                {textos.colunas.atendente}
              </th>
            )}
            <th className="px-4 py-3 text-right text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {textos.colunas.acoes}
            </th>
          </tr>
        </thead>
        {[...dias].map(([dia, mensagens]) => <tbody key={dia}>
          {dia && <tr className="border-t bg-muted/40">
            <th scope="rowgroup" colSpan={mostrarAtendente ? 6 : 5} className="px-4 py-2 text-left text-xs font-semibold">
              <time dateTime={dia}>{new Date(mensagens[0].dataEnvio).toLocaleDateString("pt-BR", { dateStyle: "full" })}</time>
            </th>
          </tr>}
          {mensagens.map((mensagem) => {
            const editavel = mensagem.status === "AGENDADA";
            return (
              <tr
                key={mensagem.id}
                data-status={mensagem.status}
                className={
                  editavel
                    ? "border-t border-border border-l-4 border-l-primary bg-primary/10"
                    : "border-t border-border"
                }
              >
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AvatarIniciais
                      id={mensagem.leadId}
                      nome={mensagem.leadNome}
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                    />
                    <span className="truncate font-bold text-foreground">{mensagem.leadNome}</span>
                  </div>
                </td>
                <td className="max-w-xs px-4 py-3 truncate text-muted-foreground">
                  {mensagem.conteudo}
                </td>
                <td className="px-4 py-3 text-xs font-medium text-muted-foreground">
                  {new Date(mensagem.dataEnvio).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <PillDeStatus tom={TOM_DO_STATUS[mensagem.status]}>
                    {textos.status[mensagem.status.toLowerCase() as "agendada" | "enviada" | "cancelada"]}
                  </PillDeStatus>
                </td>
                {mostrarAtendente && (
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <AvatarIniciais
                        id={mensagem.atendenteId}
                        nome={mensagem.atendenteNome}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                      />
                      <span className="truncate text-xs font-medium">{mensagem.atendenteNome}</span>
                    </div>
                  </td>
                )}
                <td className="px-4 py-3 text-right">
                  {editavel && onEditar && onCancelar && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" disabled={cancelando} onClick={() => onEditar(mensagem)}>
                        {textos.editar}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        aria-label={`${textos.cancelar} ${mensagem.leadNome}`}
                        disabled={cancelando}
                        onClick={() => onCancelar(mensagem.id)}
                      >
                        <X className="size-(--tamanho-icone-interface)" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>)}
      </table>
    </div>
  );
}
