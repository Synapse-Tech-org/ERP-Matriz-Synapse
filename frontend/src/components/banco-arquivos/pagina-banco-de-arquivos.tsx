"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FolderOpen,
  HardDrive, LayoutGrid, List, Search, Trash2, Upload, UploadCloud, X,
} from "lucide-react";

import { ExigeCapacidade } from "@/components/gestao/exige-capacidade";
import { CabecalhoListaV2 } from "@/components/shell/cabecalho-lista-v2";
import recursosV2 from "@/components/shell/agenda-recursos-v2.module.css";
import { IconeFrontendV2 } from "@/components/shell/icone-frontend-v2";
import listaV2 from "@/components/shell/lista-v2.module.css";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ErroDeCarregamento } from "@/components/ui/erro-de-carregamento";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErroDeApi } from "@/lib/api/errors";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  baixarArquivoDoBanco, CHAVE_DO_BANCO, listarArquivosDoBanco, obterArquivoDoBanco, ORDENS_DO_BANCO,
  PASTAS_DO_BANCO, removerArquivoDoBanco, restaurarArquivoDoBanco, TIPOS_DO_BANCO_ADICIONAIS, TIPOS_DO_BANCO_EM_DESTAQUE,
  type ArquivoDoBanco, type FiltrosDoBanco, type OrdemDoBanco, type PastaDoBanco, type TipoDoBanco,
} from "@/lib/banco-arquivos/api";
import { useTextos } from "@/lib/config/textos-provider";
import { useFuncionalidadesHabilitadas } from "@/lib/config/use-funcionalidades";
import { useCapacidades } from "@/lib/gestao/use-capacidades";
import { copiarTexto } from "@/lib/mensagens/copiar-texto";
import { cn } from "@/lib/utils";

import { formatarBytes, ICONES_DOS_TIPOS, mensagemDoErro, type TextosDoBanco } from "./apresentacao-do-arquivo";
import estilos from "./banco-de-arquivos.module.css";
import { ColecaoDeArquivos } from "./colecao-de-arquivos";
import { DialogoDoBanco, DialogoDetalhesArquivo, DialogoEditarArquivo, DialogoUploadDeArquivos } from "./dialogos-do-banco";
import { DialogoEnviarArquivoDeBanco } from "./dialogo-enviar-arquivo-de-banco";

const FILTROS_INICIAIS: FiltrosDoBanco = { pasta: null, tipo: null, busca: "", ordem: "recentes", pagina: 0, tamanho: 25 };
const ID_VALIDO = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

interface Aviso {
  texto: string;
  erro?: boolean;
  desfazerId?: string;
}

function podeRepetir(tentativas: number, erro: unknown) {
  return tentativas === 0 && (!(erro instanceof ErroDeApi) || erro.status >= 500);
}

export function PaginaBancoDeArquivos() {
  const t = useTextos().bancoArquivos;
  const flags = useFuncionalidadesHabilitadas();
  const usuario = useAuthStore((estado) => estado.usuarioId);
  if (flags.isPending) return <p className="p-6" role="status">{t.carregando}</p>;
  if (flags.isError) return <ErroDeCarregamento className="m-6" mensagem={t.erroLista} onTentarNovamente={flags.refetch} />;
  if (!flags.data.includes("banco_arquivos")) return <p className="p-6" role="status">{t.desativado}</p>;
  return (
    <ExigeCapacidade capacidade="banco_arquivos.ver">
      <BancoDeArquivos key={usuario} t={t} />
    </ExigeCapacidade>
  );
}

function BancoDeArquivos({ t }: { t: TextosDoBanco }) {
  const textos = useTextos();
  const cache = useQueryClient();
  const capacidades = useCapacidades();
  const usuario = useAuthStore((estado) => estado.usuarioId);
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const arquivoNaUrl = params.get("arquivo");
  const idDetalhe = arquivoNaUrl && ID_VALIDO.test(arquivoNaUrl) ? arquivoNaUrl : null;
  const [campoBusca, setCampoBusca] = useState("");
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [vista, setVista] = useState<"grade" | "lista">("grade");
  const [selecionados, setSelecionados] = useState<File[] | null>(null);
  const [arquivoParaEditar, setArquivoParaEditar] = useState<ArquivoDoBanco | null>(null);
  const [arquivoParaExcluir, setArquivoParaExcluir] = useState<ArquivoDoBanco | null>(null);
  const [arquivoParaEnviar, setArquivoParaEnviar] = useState<ArquivoDoBanco | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const downloadEmAndamento = useRef(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const consulta = useQuery({
    queryKey: [...CHAVE_DO_BANCO, usuario, "lista", filtros],
    queryFn: ({ signal }) => listarArquivosDoBanco(filtros, signal),
    retry: podeRepetir,
  });
  const dados = consulta.data;
  const detalheNaLista = dados?.itens.find(({ id }) => id === idDetalhe);
  const detalhe = useQuery({
    queryKey: [...CHAVE_DO_BANCO, usuario, "arquivo", idDetalhe],
    queryFn: ({ signal }) => obterArquivoDoBanco(idDetalhe!, signal),
    enabled: Boolean(idDetalhe && !detalheNaLista),
    retry: podeRepetir,
  });
  const arquivoDetalhe = detalheNaLista ?? detalhe.data;
  const podeCarregar = capacidades.pode("banco_arquivos.criar") && Boolean(dados?.limiteArquivoBytes);
  const podeEditar = capacidades.pode("banco_arquivos.editar");
  const podeExcluir = capacidades.pode("banco_arquivos.excluir");
  const podeEnviar = capacidades.pode("banco_arquivos.enviar")
    && capacidades.pode("clientes.acessar") && capacidades.pode("atendimentos.responder");
  const totalPaginas = Math.max(1, Math.ceil((dados?.total ?? 0) / filtros.tamanho));
  const tipoAdicional = TIPOS_DO_BANCO_ADICIONAIS.find((tipo) => tipo === filtros.tipo);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const busca = campoBusca.trim();
      setFiltros((atuais) => atuais.busca === busca ? atuais : { ...atuais, busca, pagina: 0 });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [campoBusca]);

  useEffect(() => {
    if (!aviso || aviso.desfazerId || aviso.erro) return;
    const timer = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(timer);
  }, [aviso]);

  function atualizarFiltros(novos: Partial<FiltrosDoBanco>) {
    setFiltros((atuais) => ({ ...atuais, pagina: 0, ...novos }));
  }

  function atualizarBanco() {
    void cache.invalidateQueries({ queryKey: CHAVE_DO_BANCO });
  }

  function linkDoArquivo(arquivo: ArquivoDoBanco) {
    return `${pathname}?${new URLSearchParams({ arquivo: arquivo.id })}`;
  }

  async function copiar(arquivo: ArquivoDoBanco) {
    const copiado = await copiarTexto(new URL(linkDoArquivo(arquivo), window.location.origin).href);
    setAviso({ texto: copiado ? t.linkCopiado : t.erroCopiar, erro: !copiado });
  }

  async function baixar(arquivo: ArquivoDoBanco) {
    if (downloadEmAndamento.current) return;
    downloadEmAndamento.current = true;
    setBaixando(arquivo.id);
    try {
      const { blob, nome } = await baixarArquivoDoBanco(arquivo.id);
      if (useAuthStore.getState().usuarioId !== usuario) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome ?? arquivo.nome;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAviso({ texto: t.downloadPreparado });
    } catch (erro) {
      setAviso({ texto: mensagemDoErro(erro, t), erro: true });
    } finally {
      downloadEmAndamento.current = false;
      setBaixando(null);
    }
  }

  const excluir = useMutation({
    mutationFn: removerArquivoDoBanco,
    onSuccess: (_, id) => {
      setArquivoParaExcluir(null);
      if (dados?.itens.length === 1 && filtros.pagina > 0) atualizarFiltros({ pagina: filtros.pagina - 1 });
      atualizarBanco();
      setAviso({ texto: t.arquivoExcluido, desfazerId: id });
    },
  });
  const restaurar = useMutation({
    mutationFn: restaurarArquivoDoBanco,
    onSuccess: () => {
      atualizarBanco();
      setAviso({ texto: t.arquivoRestaurado });
    },
    onError: (erro) => setAviso((atual) => ({ ...atual, texto: mensagemDoErro(erro, t), erro: true })),
  });

  function aoArrastar(evento: DragEvent<HTMLDivElement>) {
    if (!evento.dataTransfer.types.includes("Files")) return;
    evento.preventDefault();
    evento.dataTransfer.dropEffect = podeCarregar ? "copy" : "none";
    if (podeCarregar) setArrastando(true);
  }

  function aoSoltar(evento: DragEvent<HTMLDivElement>) {
    if (!evento.dataTransfer.types.includes("Files")) return;
    evento.preventDefault();
    setArrastando(false);
    const arquivos = Array.from(evento.dataTransfer.files);
    if (podeCarregar && arquivos.length > 0) setSelecionados(arquivos);
  }

  return (
    <section className={cn(listaV2.pagina, recursosV2.paleta, estilos.pagina)} data-layout="v2">
      <CabecalhoListaV2 titulo={t.titulo} grupo={textos.menu.grupoRecursos} busca={textos.gestao?.v2?.buscaGlobal} />
      <header className={estilos.cabecalho}>
        <div><h1>{t.titulo}</h1><p>{t.descricao}</p></div>
        {podeCarregar && (
          <button type="button" className={estilos.botaoDestaque} onClick={() => setSelecionados([])}>
            <Upload aria-hidden /> {t.enviarArquivos}
          </button>
        )}
      </header>
      <div className={estilos.corpo} onDragOver={aoArrastar} onDrop={aoSoltar}
        onDragLeave={(evento) => {
          if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setArrastando(false);
        }}>
        <div className={estilos.ferramentas}>
          <div className={estilos.busca}>
            <Search aria-hidden />
            <input type="search" value={campoBusca} maxLength={200} onChange={(evento) => setCampoBusca(evento.target.value)}
              placeholder={t.busca} aria-label={t.busca} />
            {campoBusca && (
              <button type="button" aria-label={t.limparBusca} title={t.limparBusca} onClick={() => setCampoBusca("")}><X aria-hidden /></button>
            )}
          </div>
          <div className={estilos.tipos} role="group" aria-label={t.filtrarTipo}>
            {[null, ...TIPOS_DO_BANCO_EM_DESTAQUE].map((tipo: TipoDoBanco | null) => {
              const icone = tipo ? ICONES_DOS_TIPOS[tipo].filtro : "apps-2-line";
              return <button type="button" key={tipo ?? "todos"} aria-pressed={filtros.tipo === tipo}
                onClick={() => atualizarFiltros({ tipo })}><IconeFrontendV2 nome={icone} /> {t.tipos[tipo ?? "todos"]}</button>;
            })}
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" data-selecionado={Boolean(tipoAdicional)} />}>
                {tipoAdicional ? t.tipos[tipoAdicional] : t.maisTipos} <ChevronDown aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent className={estilos.menuDeAcoes}>
                {TIPOS_DO_BANCO_ADICIONAIS.map((tipo) => (
                  <DropdownMenuItem key={tipo} onClick={() => atualizarFiltros({ tipo })}>
                    <IconeFrontendV2 nome={ICONES_DOS_TIPOS[tipo].filtro} /> {t.tipos[tipo]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className={estilos.ferramentasFinais}>
            {dados && <div className={estilos.armazenamento}>
              <HardDrive aria-hidden />
              <span>{t.usoArmazenamento.split(/(\{usado\}|\{limite\})/).map((parte, indice) => {
                if (parte === "{usado}") return <strong key={indice}>{formatarBytes(dados.usadoBytes)}</strong>;
                if (parte === "{limite}") return formatarBytes(dados.limiteBytes);
                return parte;
              })}</span>
              <progress aria-label={t.armazenamento} value={dados.usadoBytes} max={dados.limiteBytes} />
            </div>}
            <Select value={filtros.ordem} onValueChange={(ordem: OrdemDoBanco | null) => { if (ordem) atualizarFiltros({ ordem }); }}>
              <SelectTrigger aria-label={t.ordenar} className={estilos.ordenacao}>
                <ArrowDownWideNarrow aria-hidden />
                <SelectValue>{t.ordens[filtros.ordem]}</SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {ORDENS_DO_BANCO.map((ordem) => <SelectItem key={ordem} value={ordem}>{t.ordens[ordem]}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className={estilos.modulos} role="group" aria-label={t.modoExibicao}>
              <button type="button" aria-label={t.grade} title={t.grade} aria-pressed={vista === "grade"} onClick={() => setVista("grade")}><LayoutGrid aria-hidden /></button>
              <button type="button" aria-label={t.lista} title={t.lista} aria-pressed={vista === "lista"} onClick={() => setVista("lista")}><List aria-hidden /></button>
            </div>
          </div>
        </div>
        <div className={estilos.resultados} aria-busy={consulta.isFetching}>
          <div className={estilos.resumo}>
            <h2>
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" title={t.pastasTitulo} />}>
                  {filtros.pasta ? t.pastas[filtros.pasta] : t.todosArquivos} <ChevronDown aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent className={estilos.menuDeAcoes}>
                  <DropdownMenuItem onClick={() => atualizarFiltros({ pasta: null })}>{t.todosArquivos}</DropdownMenuItem>
                  {PASTAS_DO_BANCO.map((pasta: PastaDoBanco) => (
                    <DropdownMenuItem key={pasta} onClick={() => atualizarFiltros({ pasta })}>
                      <FolderOpen aria-hidden /><span className="flex-1">{t.pastas[pasta]}</span>
                      {dados && <span>{dados.contagemPorPasta[pasta] ?? 0}</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </h2>
            {dados && <span>{dados.total === 1 ? t.totalSingular : t.total.replace("{total}", String(dados.total))}</span>}
          </div>
          {consulta.isPending && <p role="status" className={estilos.estado}>{t.carregando}</p>}
          {consulta.isError && <ErroDeCarregamento mensagem={mensagemDoErro(consulta.error, t, t.erroLista)} onTentarNovamente={consulta.refetch} />}
          {dados && dados.itens.length === 0 && (
            <div className={estilos.vazio}>
              <span><FolderOpen aria-hidden /></span>
              <strong>{t.nenhum}</strong>
              <p>{filtros.busca || filtros.tipo ? t.nenhumFiltro : podeCarregar ? t.nenhumEnvio : t.nenhumCadastro}</p>
            </div>
          )}
          {dados && dados.itens.length > 0 && (
            <ColecaoDeArquivos arquivos={dados.itens} vista={vista} t={t} acoes={{
              abrir: (arquivo) => router.replace(linkDoArquivo(arquivo), { scroll: false }),
              baixar: (arquivo) => void baixar(arquivo),
              copiar: (arquivo) => void copiar(arquivo),
              baixando,
              enviar: podeEnviar ? setArquivoParaEnviar : undefined,
              editar: podeEditar ? setArquivoParaEditar : undefined,
              excluir: podeExcluir ? (arquivo) => { excluir.reset(); setArquivoParaExcluir(arquivo); } : undefined,
            }} />
          )}
          {dados && (totalPaginas > 1 || filtros.pagina > 0) && (
            <div className={estilos.paginacao}>
              <button type="button" className={estilos.acaoIcone} disabled={filtros.pagina === 0} aria-label={t.anterior} title={t.anterior}
                onClick={() => atualizarFiltros({ pagina: Math.min(filtros.pagina - 1, totalPaginas - 1) })}><ChevronLeft aria-hidden /></button>
              <span>{t.pagina.replace("{atual}", String(filtros.pagina + 1)).replace("{total}", String(totalPaginas))}</span>
              <button type="button" className={estilos.acaoIcone} disabled={filtros.pagina + 1 >= totalPaginas}
                aria-label={t.proxima} title={t.proxima} onClick={() => atualizarFiltros({ pagina: filtros.pagina + 1 })}><ChevronRight aria-hidden /></button>
            </div>
          )}
        </div>
        {podeCarregar && arrastando && <div className={estilos.arrastando}><UploadCloud aria-hidden /><strong>{t.soltar}</strong></div>}
      </div>

      {podeCarregar && selecionados && dados && (
        <DialogoUploadDeArquivos t={t} arquivosIniciais={selecionados} pastaInicial={filtros.pasta ?? PASTAS_DO_BANCO[0]}
          limiteArquivoBytes={dados.limiteArquivoBytes} limiteDescricao={dados.limiteDescricao}
          onFechar={() => setSelecionados(null)} onAlteracao={atualizarBanco}
          onConcluir={() => { setSelecionados(null); setAviso({ texto: t.arquivosEnviados }); }} />
      )}
      {podeEditar && arquivoParaEditar && (
        <DialogoEditarArquivo t={t} arquivo={arquivoParaEditar} limiteDescricao={dados?.limiteDescricao}
          onFechar={() => setArquivoParaEditar(null)}
          onConcluir={() => { setArquivoParaEditar(null); atualizarBanco(); setAviso({ texto: t.arquivoEditado }); }} />
      )}
      {podeExcluir && arquivoParaExcluir && (
        <DialogoDoBanco t={t} titulo={t.excluirTitulo} descricao={t.excluirDescricao.replace("{nome}", arquivoParaExcluir.nome)}
          onFechar={() => setArquivoParaExcluir(null)} ocupado={excluir.isPending}>
          {excluir.isError && <p className={cn(estilos.corpoDialogo, estilos.erro)} role="alert">{mensagemDoErro(excluir.error, t)}</p>}
          <div className={estilos.rodapeDialogo}>
            <button type="button" className={estilos.botaoSecundario} disabled={excluir.isPending} onClick={() => setArquivoParaExcluir(null)}>{t.cancelar}</button>
            <button type="button" className={estilos.botaoPerigo} disabled={excluir.isPending}
              onClick={() => excluir.mutate(arquivoParaExcluir.id)}><Trash2 aria-hidden /> {t.excluir}</button>
          </div>
        </DialogoDoBanco>
      )}
      {podeEnviar && arquivoParaEnviar && <DialogoEnviarArquivoDeBanco arquivo={arquivoParaEnviar} onFechar={() => setArquivoParaEnviar(null)} />}
      {idDetalhe && (arquivoDetalhe ? (
        <DialogoDetalhesArquivo t={t} arquivo={arquivoDetalhe} baixando={baixando === arquivoDetalhe.id}
          onBaixar={() => void baixar(arquivoDetalhe)} onFechar={() => router.replace(pathname, { scroll: false })} />
      ) : (
        <DialogoDoBanco t={t} titulo={t.detalhes} descricao="" onFechar={() => router.replace(pathname, { scroll: false })}>
          <div className={estilos.corpoDialogo}>
            {detalhe.isError
              ? <ErroDeCarregamento mensagem={mensagemDoErro(detalhe.error, t, t.erroArquivo)} onTentarNovamente={detalhe.refetch} />
              : <p role="status">{t.carregando}</p>}
          </div>
        </DialogoDoBanco>
      ))}
      {aviso && (
        <div className={estilos.aviso} data-erro={aviso.erro || undefined} role={aviso.erro ? "alert" : "status"}>
          {!aviso.erro && <CheckCircle2 aria-hidden />}
          <span>{aviso.texto}</span>
          {podeExcluir && aviso.desfazerId && (
            <button type="button" disabled={restaurar.isPending} onClick={() => restaurar.mutate(aviso.desfazerId!)}>
              {restaurar.isPending ? t.aguarde : t.desfazer}
            </button>
          )}
          <button type="button" aria-label={t.fechar} title={t.fechar} onClick={() => setAviso(null)}><X aria-hidden /></button>
        </div>
      )}
    </section>
  );
}
