"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/auth/auth-store";
import { CHAVE_DO_BANCO, listarArquivosDoBanco } from "@/lib/banco-arquivos/api";
import { LIMITE_LEGENDA_ARQUIVO_BANCO, useEnviarArquivoDoBanco } from "@/lib/banco-arquivos/use-enviar-arquivo-do-banco";
import { useTextos } from "@/lib/config/textos-provider";

import { formatarBytes, IconeDoArquivo, mensagemDoErro } from "./apresentacao-do-arquivo";
import estilos from "./banco-de-arquivos.module.css";
import { DialogoDoBanco } from "./dialogos-do-banco";

const TAMANHO_DA_PAGINA = 12;

export function DialogoBancoNoAtendimento({ atendimentoId, onFechar, onConfirmarEnvio, onEnviado }: {
  atendimentoId: string;
  onFechar: () => void;
  onConfirmarEnvio: () => Promise<boolean>;
  onEnviado: () => void;
}) {
  const { bancoArquivos: t, bancoArquivosEnvio: envioTextos, bancoArquivosNoAtendimento: chat } = useTextos();
  const usuario = useAuthStore((estado) => estado.usuarioId);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState({ termo: "", pagina: 0 });
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [legenda, setLegenda] = useState("");
  const [validando, setValidando] = useState(false);
  const [recusado, setRecusado] = useState(false);
  const verificando = useRef(false);
  const montado = useRef(false);
  const envio = useEnviarArquivoDoBanco();

  useLayoutEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const termo = busca.trim();
      setFiltro((atual) => atual.termo === termo ? atual : { termo, pagina: 0 });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [busca]);

  const resultado = useQuery({
    queryKey: [...CHAVE_DO_BANCO, usuario, "selecao-no-atendimento", filtro],
    queryFn: ({ signal }) => listarArquivosDoBanco({
      pasta: null, tipo: null, busca: filtro.termo, ordem: "recentes",
      pagina: filtro.pagina, tamanho: TAMANHO_DA_PAGINA,
    }, signal),
    retry: false,
  });
  const carregando = resultado.isPending || filtro.termo !== busca.trim();
  const arquivos = carregando ? [] : resultado.data?.itens ?? [];
  const selecionado = arquivos.find(({ id }) => id === escolhido);
  const totalPaginas = Math.max(1, Math.ceil((resultado.data?.total ?? 0) / TAMANHO_DA_PAGINA));
  const ocupado = validando || envio.isPending;

  async function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!selecionado || selecionado.tipo === "DWG" || verificando.current || envio.emAndamento()) return;
    verificando.current = true;
    setValidando(true);
    setRecusado(false);
    try {
      const autorizado = await onConfirmarEnvio();
      if (!montado.current || useAuthStore.getState().usuarioId !== usuario) return;
      if (!autorizado) {
        setRecusado(true);
        return;
      }
      envio.enviar({ arquivoId: selecionado.id, atendimentoId, legenda }, { onSuccess: onEnviado });
    } catch {
      if (montado.current) setRecusado(true);
    } finally {
      verificando.current = false;
      if (montado.current) setValidando(false);
    }
  }

  function fechar() {
    if (!verificando.current && !envio.emAndamento()) onFechar();
  }

  return (
    <DialogoDoBanco t={t} titulo={t.titulo} descricao={chat.descricao} onFechar={fechar} ocupado={ocupado}>
      <form onSubmit={confirmar}>
        <div className={estilos.corpoDialogo}>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" className="h-10 ps-9" aria-label={t.busca} placeholder={t.busca}
              value={busca} maxLength={200} disabled={ocupado} onChange={(evento) => setBusca(evento.target.value)} />
          </div>
          {carregando && <p role="status" className="text-sm text-muted-foreground">{t.carregando}</p>}
          {resultado.isError && !carregando && (
            <ErroDeCarregamento mensagem={mensagemDoErro(resultado.error, t, t.erroLista)} onTentarNovamente={resultado.refetch} />
          )}
          {resultado.isSuccess && !carregando && arquivos.length === 0 && (
            <p className="text-sm text-muted-foreground">{chat.vazio}</p>
          )}
          {arquivos.length > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label={t.todosArquivos}>
              {arquivos.map((arquivo) => (
                <li key={arquivo.id}>
                  <button type="button"
                    className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 text-start hover:bg-muted aria-pressed:border-primary/25 aria-pressed:bg-primary/10 disabled:opacity-60"
                    aria-pressed={escolhido === arquivo.id}
                    disabled={ocupado || arquivo.tipo === "DWG"}
                    onClick={() => setEscolhido(arquivo.id)}>
                    <IconeDoArquivo tipo={arquivo.tipo} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm" title={arquivo.nome}>{arquivo.nome}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {arquivo.tipo === "DWG" ? envioTextos.tipoIncompativel : formatarBytes(arquivo.tamanhoBytes)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!carregando && (totalPaginas > 1 || filtro.pagina > 0) && (
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <Button type="button" variant="outline" size="icon-sm" aria-label={t.anterior}
                disabled={ocupado || filtro.pagina === 0}
                onClick={() => setFiltro((atual) => ({ ...atual, pagina: Math.min(atual.pagina - 1, totalPaginas - 1) }))}><ChevronLeft aria-hidden /></Button>
              <span>{t.pagina.replace("{atual}", String(filtro.pagina + 1)).replace("{total}", String(totalPaginas))}</span>
              <Button type="button" variant="outline" size="icon-sm" aria-label={t.proxima}
                disabled={ocupado || filtro.pagina + 1 >= totalPaginas}
                onClick={() => setFiltro((atual) => ({ ...atual, pagina: atual.pagina + 1 }))}><ChevronRight aria-hidden /></Button>
            </div>
          )}
          <Input aria-label={envioTextos.legenda} placeholder={envioTextos.legenda} value={legenda}
            maxLength={LIMITE_LEGENDA_ARQUIVO_BANCO} disabled={ocupado} onChange={(evento) => setLegenda(evento.target.value)} />
          {(recusado || envio.error) && (
            <p role="alert" className="text-sm text-destructive">{recusado ? envioTextos.semPermissao : envio.mensagemErro}</p>
          )}
        </div>
        <div className={estilos.rodapeDialogo}>
          <Button type="button" variant="outline" disabled={ocupado} onClick={fechar}>{t.cancelar}</Button>
          <Button type="submit" disabled={ocupado || !selecionado || selecionado.tipo === "DWG"}>
            <Send aria-hidden /> {ocupado ? envioTextos.enviando : envioTextos.enviar}
          </Button>
        </div>
      </form>
    </DialogoDoBanco>
  );
}
