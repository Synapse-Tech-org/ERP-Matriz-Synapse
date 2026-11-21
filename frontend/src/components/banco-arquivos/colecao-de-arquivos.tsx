"use client";

import { Link2, Pencil, Trash2 } from "lucide-react";

import { IconeFrontendV2 } from "@/components/shell/icone-frontend-v2";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ArquivoDoBanco } from "@/lib/banco-arquivos/api";

import { formatarBytes, formatarDataArquivo, IconeDoArquivo, SeloDoArquivo, type TextosDoBanco } from "./apresentacao-do-arquivo";
import estilos from "./banco-de-arquivos.module.css";

interface Acoes {
  abrir: (arquivo: ArquivoDoBanco) => void;
  baixar: (arquivo: ArquivoDoBanco) => void;
  copiar: (arquivo: ArquivoDoBanco) => void;
  enviar?: (arquivo: ArquivoDoBanco) => void;
  editar?: (arquivo: ArquivoDoBanco) => void;
  excluir?: (arquivo: ArquivoDoBanco) => void;
  baixando: string | null;
}

function AcoesDoArquivo({ arquivo, acoes, t }: { arquivo: ArquivoDoBanco; acoes: Acoes; t: TextosDoBanco }) {
  return (
    <div className={estilos.acoes}>
      {acoes.enviar && (
        <button type="button" className={estilos.enviarArquivo} onClick={() => acoes.enviar?.(arquivo)}>
          <IconeFrontendV2 nome="send-plane-2-line" /> {t.enviar}
        </button>
      )}
      <button type="button" className={estilos.acaoIcone} onClick={() => acoes.baixar(arquivo)}
        disabled={acoes.baixando === arquivo.id} aria-label={t.baixar} title={t.baixar}>
        <IconeFrontendV2 nome="download-2-line" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" className={estilos.acaoIcone} aria-label={t.maisAcoes} title={t.maisAcoes} />}>
          <IconeFrontendV2 nome="more-2-fill" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={estilos.menuDeAcoes}>
          <DropdownMenuItem onClick={() => acoes.copiar(arquivo)}><Link2 aria-hidden />{t.copiarLink}</DropdownMenuItem>
          {acoes.editar && <DropdownMenuItem onClick={() => acoes.editar?.(arquivo)}><Pencil aria-hidden />{t.editar}</DropdownMenuItem>}
          {acoes.excluir && <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => acoes.excluir?.(arquivo)}>
              <Trash2 aria-hidden />{t.excluir}
            </DropdownMenuItem>
          </>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ColecaoDeArquivos({ arquivos, acoes, t, vista }: {
  arquivos: ArquivoDoBanco[]; acoes: Acoes; t: TextosDoBanco; vista: "grade" | "lista";
}) {
  if (vista === "lista") {
    return (
      <div className={estilos.lista}>
        <table aria-label={t.titulo}>
          <thead>
            <tr>
              <th scope="col">{t.arquivo}</th><th scope="col">{t.descricaoArquivo}</th>
              <th scope="col">{t.tipo}</th><th scope="col">{t.tamanho}</th>
              <th scope="col">{t.adicionado}</th><th scope="col"><span className="sr-only">{t.acoes}</span></th>
            </tr>
          </thead>
          <tbody>
            {arquivos.map((arquivo) => (
              <tr key={arquivo.id}>
                <td>
                  <button type="button" className={estilos.nomeNaLista} onClick={() => acoes.abrir(arquivo)}>
                    <IconeDoArquivo tipo={arquivo.tipo} />
                    <span>
                      <strong title={arquivo.nome}>{arquivo.nome}</strong>
                      <small>{formatarBytes(arquivo.tamanhoBytes)}</small>
                    </span>
                  </button>
                </td>
                <td className={estilos.descricaoNaLista} title={arquivo.descricao ?? undefined}>{arquivo.descricao}</td>
                <td><SeloDoArquivo arquivo={arquivo} /></td>
                <td>{formatarBytes(arquivo.tamanhoBytes)}</td>
                <td><time dateTime={arquivo.criadoEm}>{formatarDataArquivo(arquivo)}</time></td>
                <td><AcoesDoArquivo arquivo={arquivo} acoes={acoes} t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ul className={estilos.grade} aria-label={t.titulo}>
      {arquivos.map((arquivo) => (
        <li className={estilos.cartao} key={arquivo.id}>
          <button type="button" className={estilos.miniatura} data-tipo={arquivo.tipo}
            aria-label={`${t.detalhes} · ${arquivo.nome}`} onClick={() => acoes.abrir(arquivo)}>
            {arquivo.tipo === "IMAGEM" ? (
              <span className={estilos.iconeImagem}><IconeFrontendV2 nome="image-2-line" /></span>
            ) : <IconeDoArquivo tipo={arquivo.tipo} grande />}
            <SeloDoArquivo arquivo={arquivo} />
          </button>
          <div className={estilos.cartaoConteudo}>
            <button type="button" className={estilos.nomeNaGrade} title={arquivo.nome} onClick={() => acoes.abrir(arquivo)}>{arquivo.nome}</button>
            <small>{formatarBytes(arquivo.tamanhoBytes)} · <time dateTime={arquivo.criadoEm}>{formatarDataArquivo(arquivo)}</time></small>
            <p className={estilos.descricaoNaGrade} title={arquivo.descricao ?? undefined}>{arquivo.descricao}</p>
            <AcoesDoArquivo arquivo={arquivo} acoes={acoes} t={t} />
          </div>
        </li>
      ))}
    </ul>
  );
}
