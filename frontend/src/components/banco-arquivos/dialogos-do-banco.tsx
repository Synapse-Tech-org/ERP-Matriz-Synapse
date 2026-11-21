"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { Download, FileText, Upload, UploadCloud, X } from "lucide-react";

import recursosV2 from "@/components/shell/agenda-recursos-v2.module.css";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErroDeApi } from "@/lib/api/errors";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  adicionarArquivoAoBanco, editarArquivoDoBanco, PASTAS_DO_BANCO, visualizarArquivoDoBanco,
  type ArquivoDoBanco, type PastaDoBanco,
} from "@/lib/banco-arquivos/api";
import { cn } from "@/lib/utils";

import { extensao, EXTENSOES_ACEITAS, formatarBytes, formatarDataArquivo, IconeDoArquivo, mensagemDoErro, tipoDoNome, type TextosDoBanco } from "./apresentacao-do-arquivo";
import estilos from "./banco-de-arquivos.module.css";

interface PropsDialogo {
  t: TextosDoBanco;
  onFechar: () => void;
}

export function DialogoDoBanco({ t, onFechar, titulo, descricao, children, ocupado = false }: PropsDialogo & {
  titulo: string;
  descricao: string;
  children: ReactNode;
  ocupado?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !ocupado) onFechar(); }}>
      <DialogContent showCloseButton={false} className={cn(recursosV2.formulario, estilos.dialogo)} overlayClassName={estilos.fundoDialogo}>
        <div className={estilos.cabecalhoDialogo}>
          <div className="min-w-0">
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription className="break-words">{descricao}</DialogDescription>
          </div>
          <button type="button" className={estilos.acaoIcone} aria-label={t.fechar} disabled={ocupado} onClick={onFechar}><X aria-hidden /></button>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function SeletorDePasta({ t, pasta, onChange, desabilitado }: {
  t: TextosDoBanco;
  pasta: PastaDoBanco;
  onChange: (pasta: PastaDoBanco) => void;
  desabilitado?: boolean;
}) {
  return (
    <div className={estilos.campo}>
      <span>{t.pasta}</span>
      <Select value={pasta} onValueChange={(valor: PastaDoBanco | null) => { if (valor) onChange(valor); }} disabled={desabilitado}>
        <SelectTrigger className={estilos.selecionarPasta} aria-label={t.pasta}><SelectValue>{t.pastas[pasta]}</SelectValue></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {PASTAS_DO_BANCO.map((id) => <SelectItem key={id} value={id}>{t.pastas[id]}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ItemDaFila {
  chave: string;
  arquivo: File;
  erro?: string;
}

function paraItens(arquivos: File[]) {
  const itens = arquivos.map((arquivo) => ({
    chave: JSON.stringify([arquivo.name, arquivo.size, arquivo.lastModified]),
    arquivo,
  }));
  return [...new Map(itens.map((item) => [item.chave, item])).values()];
}

export function DialogoUploadDeArquivos({ t, onFechar, pastaInicial, arquivosIniciais, limiteArquivoBytes, limiteDescricao, onAlteracao, onConcluir }: PropsDialogo & {
  pastaInicial: PastaDoBanco;
  arquivosIniciais: File[];
  limiteArquivoBytes: number;
  limiteDescricao: number;
  onAlteracao: () => void;
  onConcluir: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [fila, setFila] = useState<ItemDaFila[]>(() => paraItens(arquivosIniciais));
  const [pasta, setPasta] = useState(pastaInicial);
  const [descricao, setDescricao] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(false);

  function acrescentar(arquivos: File[]) {
    const novos = paraItens(arquivos);
    setFila((atual) => [...new Map([...atual, ...novos].map((item) => [item.chave, item])).values()]);
  }

  function validacao(arquivo: File) {
    if (!tipoDoNome(arquivo.name)) return t.erroTipo;
    if (arquivo.size === 0) return t.erroInvalido;
    if (arquivo.size > limiteArquivoBytes) return t.erroTamanho;
    return null;
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setErro(false);
    const restantes: ItemDaFila[] = [];
    const usuario = useAuthStore.getState().usuarioId;
    let enviados = 0;
    let temporariamenteBloqueado = false;
    for (const item of fila) {
      if (useAuthStore.getState().usuarioId !== usuario) return;
      if (validacao(item.arquivo) || temporariamenteBloqueado) {
        restantes.push(item);
        continue;
      }
      try {
        await adicionarArquivoAoBanco(item.arquivo, pasta, descricao.trim());
        enviados++;
        setFila((atual) => atual.filter(({ chave }) => chave !== item.chave));
      } catch (falha) {
        temporariamenteBloqueado = falha instanceof ErroDeApi && [401, 403, 429, 507].includes(falha.status);
        restantes.push({ ...item, erro: mensagemDoErro(falha, t) });
      }
    }
    setFila(restantes);
    setOcupado(false);
    if (enviados > 0) onAlteracao();
    if (restantes.length === 0) onConcluir();
    else setErro(true);
  }

  return (
    <DialogoDoBanco t={t} onFechar={onFechar} ocupado={ocupado} titulo={t.enviarArquivos}
      descricao={t.uploadAjuda.replace("{limite}", formatarBytes(limiteArquivoBytes))}>
      <form onSubmit={enviar}>
        <div className={estilos.corpoDialogo}>
          <div className={estilos.zonaDeUpload}
            onDragOver={(evento) => evento.preventDefault()}
            onDrop={(evento) => { evento.preventDefault(); if (!ocupado) acrescentar(Array.from(evento.dataTransfer.files)); }}>
            <UploadCloud aria-hidden className={estilos.iconeUpload} />
            <strong>{t.uploadSoltar}</strong>
            <p>{t.uploadAlternativa}</p>
            <input ref={input} type="file" hidden multiple accept={EXTENSOES_ACEITAS.join(",")}
              onChange={(evento) => {
                acrescentar(Array.from(evento.target.files ?? []));
                evento.target.value = "";
              }} />
            <button type="button" className={estilos.botaoSecundario} disabled={ocupado} onClick={() => input.current?.click()}>
              {t.uploadSelecionar}
            </button>
            {fila.length > 0 && (
              <ul className={estilos.fila}>
                {fila.map(({ chave, arquivo, erro: erroDoItem }) => {
                  const problema = validacao(arquivo) ?? erroDoItem;
                  const tipo = tipoDoNome(arquivo.name);
                  return (
                    <li key={chave}>
                      {tipo ? <IconeDoArquivo tipo={tipo} /> : <FileText aria-hidden className="size-4 shrink-0" />}
                      <div>
                        <strong title={arquivo.name}>{arquivo.name}</strong>
                        <small>{formatarBytes(arquivo.size)}</small>
                        {problema && <small className={estilos.erro}>{problema}</small>}
                      </div>
                      <button type="button" className={estilos.acaoIcone} aria-label={`${t.uploadRemover} · ${arquivo.name}`}
                        disabled={ocupado} onClick={() => setFila((atual) => atual.filter((item) => item.chave !== chave))}>
                        <X aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <SeletorDePasta t={t} pasta={pasta} onChange={setPasta} desabilitado={ocupado} />
          <label className={estilos.campo}>
            <span>{t.descricaoArquivo}</span>
            <textarea value={descricao} onChange={(evento) => setDescricao(evento.target.value)}
              maxLength={limiteDescricao} placeholder={t.uploadDescricao} disabled={ocupado} />
          </label>
          {erro && <p role="alert" className={estilos.erro}>{t.uploadErroLote}</p>}
        </div>
        <div className={estilos.rodapeDialogo}>
          <button type="button" className={estilos.botaoSecundario} onClick={onFechar} disabled={ocupado}>{t.cancelar}</button>
          <button type="submit" className={estilos.botaoDestaque}
            disabled={ocupado || !fila.some(({ arquivo }) => !validacao(arquivo))}>
            <Upload aria-hidden /> {ocupado ? t.uploadEnviando : t.enviar}
          </button>
        </div>
      </form>
    </DialogoDoBanco>
  );
}

export function DialogoEditarArquivo({ t, onFechar, arquivo, limiteDescricao, onConcluir }: PropsDialogo & {
  arquivo: ArquivoDoBanco;
  limiteDescricao?: number;
  onConcluir: () => void;
}) {
  const sufixo = extensao(arquivo.nome);
  const [nome, setNome] = useState(arquivo.nome.slice(0, arquivo.nome.length - sufixo.length));
  const [pasta, setPasta] = useState(arquivo.pasta);
  const [descricao, setDescricao] = useState(arquivo.descricao ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado || !nome.trim()) return;
    setOcupado(true);
    setErro(null);
    try {
      await editarArquivoDoBanco(arquivo.id, { nome: nome.trim() + sufixo, pasta, descricao: descricao.trim() });
      onConcluir();
    } catch (falha) {
      setErro(mensagemDoErro(falha, t));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <DialogoDoBanco t={t} onFechar={onFechar} ocupado={ocupado} titulo={t.editarTitulo} descricao={arquivo.nome}>
      <form onSubmit={salvar}>
        <div className={estilos.corpoDialogo}>
          <label className={estilos.campo}>
            <span>{t.novoNome}</span>
            <span className={estilos.nomeEditavel}>
              <input required value={nome} onChange={(evento) => setNome(evento.target.value)} maxLength={200 - sufixo.length} disabled={ocupado} />
              <span aria-hidden>{sufixo}</span>
            </span>
          </label>
          <SeletorDePasta t={t} pasta={pasta} onChange={setPasta} desabilitado={ocupado} />
          <label className={estilos.campo}>
            <span>{t.descricaoArquivo}</span>
            <textarea value={descricao} onChange={(evento) => setDescricao(evento.target.value)} maxLength={limiteDescricao} disabled={ocupado} />
          </label>
          {erro && <p role="alert" className={estilos.erro}>{erro}</p>}
        </div>
        <div className={estilos.rodapeDialogo}>
          <button type="button" className={estilos.botaoSecundario} onClick={onFechar} disabled={ocupado}>{t.cancelar}</button>
          <button type="submit" className={estilos.botaoDestaque} disabled={ocupado || !nome.trim()}>{ocupado ? t.aguarde : t.salvar}</button>
        </div>
      </form>
    </DialogoDoBanco>
  );
}

function PreviaDeImagem({ arquivo, t }: { arquivo: ArquivoDoBanco; t: TextosDoBanco }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativa = true;
    let urlCriada: string | undefined;
    void visualizarArquivoDoBanco(arquivo.id).then((blob) => {
      if (!ativa) return;
      if (!["image/jpeg", "image/png"].includes(blob.type)) throw new Error("MIME de prévia inesperado");
      urlCriada = URL.createObjectURL(blob);
      setUrl(urlCriada);
    }).catch(() => { if (ativa) setErro(true); });
    return () => {
      ativa = false;
      if (urlCriada) URL.revokeObjectURL(urlCriada);
    };
  }, [arquivo.id]);

  if (erro) return <p role="alert" className={estilos.erro}>{t.erroPrevia}</p>;
  if (!url) return <p role="status">{t.preparandoPrevia}</p>;
  return <div className={estilos.previa}><Image fill unoptimized src={url} alt={arquivo.nome} /></div>;
}

export function DialogoDetalhesArquivo({ t, onFechar, arquivo, onBaixar, baixando }: PropsDialogo & {
  arquivo: ArquivoDoBanco;
  onBaixar: () => void;
  baixando: boolean;
}) {
  return (
    <DialogoDoBanco t={t} onFechar={onFechar} titulo={t.detalhes} descricao={arquivo.nome}>
      <div className={estilos.corpoDialogo}>
        {arquivo.tipo === "IMAGEM" && <PreviaDeImagem key={arquivo.id} arquivo={arquivo} t={t} />}
        {arquivo.descricao && <p className="whitespace-pre-wrap break-words">{arquivo.descricao}</p>}
        <dl className={estilos.metadados}>
          <div><dt>{t.pasta}</dt><dd>{t.pastas[arquivo.pasta]}</dd></div>
          <div><dt>{t.tamanho}</dt><dd>{formatarBytes(arquivo.tamanhoBytes)}</dd></div>
          <div><dt>{t.adicionado}</dt><dd><time dateTime={arquivo.criadoEm}>{formatarDataArquivo(arquivo)}</time></dd></div>
        </dl>
      </div>
      <div className={estilos.rodapeDialogo}>
        <button type="button" className={estilos.botaoSecundario} onClick={onFechar}>{t.fechar}</button>
        <button type="button" className={estilos.botaoDestaque} disabled={baixando} onClick={onBaixar}><Download aria-hidden /> {t.baixar}</button>
      </div>
    </DialogoDoBanco>
  );
}
