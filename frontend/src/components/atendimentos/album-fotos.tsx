"use client";

import { useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";

import type { MensagemResposta } from "@/lib/atendimento/types";
import { useTextos } from "@/lib/config/textos-provider";
import { cn, urlSegura } from "@/lib/utils";

import { itemDaBolha, metadadosDaMidia } from "./bolha-mensagem";
import { StatusEntregaIcone } from "./status-entrega";
import { VisualizadorMidia, type ItemDoVisualizador } from "./visualizador-midia";

type Props = {
  fotos: MensagemResposta[];
  leadId?: string;
  nomeDoRemetente: string | null;
  renderizarDetalhes: (foto: MensagemResposta, fechar: () => void) => ReactNode;
};

function urlDaFoto(foto: MensagemResposta): string | undefined {
  const url = foto.midiaUrl;
  // Blob só pode vir de uma prévia criada no cache deste navegador, nunca do histórico HTTP.
  if (foto.ordemLocalDoLoteEm && url?.startsWith("blob:")) return url;
  return urlSegura(url);
}

export function AlbumFotos({ fotos, leadId, nomeDoRemetente, renderizarDetalhes }: Props) {
  const textos = useTextos().atendimentos.mensagem.albumFotos;
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);
  const indice = fotos.findIndex((foto) => (foto.idempotencyKey ?? foto.id) === fotoAberta);
  const fechar = () => setFotoAberta(null);
  const selecionar = (posicao: number) => {
    const foto = fotos[posicao];
    if (foto) setFotoAberta(foto.idempotencyKey ?? foto.id);
  };
  const ocultas = fotos.length > 4 ? fotos.length - 3 : 0;
  const enviada = fotos[0].remetenteTipo !== "LEAD";
  const itens = indice < 0 ? [] : fotos.map((foto): ItemDoVisualizador => {
    const metadados = metadadosDaMidia(foto.midiaMetadados);
    const item = itemDaBolha(leadId, foto, metadados);
    const url = urlDaFoto(foto);
    const origem: ItemDoVisualizador["origem"] = !url || metadados.indisponivel
      ? { tipo: "indisponivel" }
      : foto.id.startsWith("temp-") && url.startsWith("blob:")
        ? { tipo: "previa-local", url }
        : item?.origem ?? { tipo: "indisponivel" };
    return {
      id: foto.id,
      nome: metadados.nome ?? metadados.legenda ?? null,
      mimetype: metadados.mimetype ?? null,
      tamanho: metadados.tamanho ?? null,
      enviadoEm: foto.enviadoEm,
      tipoMensagem: "IMAGEM",
      origem,
    };
  });
  return (
    <div className={cn("flex", enviada && "justify-end")}>
      <div
        data-slot="album-fotos"
        role="group"
        aria-label={textos.titulo.replace("{quantidade}", String(fotos.length))}
        className={cn(
          "w-full max-w-72 rounded-2xl p-2",
          enviada ? "rounded-tr-md bg-primary text-primary-foreground" : "rounded-tl-md border border-border bg-muted text-chat-texto-forte",
        )}
      >
        {nomeDoRemetente && <p className="mb-1 px-1 text-xs font-semibold">{nomeDoRemetente}</p>}
        <div className="grid grid-cols-2 gap-1">
          {fotos.slice(0, 4).map((foto, posicao) => (
            <button
              key={foto.idempotencyKey ?? foto.id}
              type="button"
              className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-background text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={posicao === 3 && ocultas > 0
                ? textos.fotosOcultas.replace("{quantidade}", String(ocultas))
                : textos.abrirFoto.replace("{posicao}", String(posicao + 1)).replace("{quantidade}", String(fotos.length))}
              onClick={() => selecionar(posicao)}
            >
              {posicao === 3 && ocultas > 0
                ? <span className="text-xl font-semibold">+{ocultas}</span>
                : <>
                    <MiniaturaDoAlbum foto={foto} indisponivel={textos.indisponivel} />
                    {enviada && <span className="absolute right-1 bottom-1 flex rounded-sm bg-background p-1 text-foreground">
                      <StatusEntregaIcone status={foto.statusEntrega} compacto />
                    </span>}
                  </>}
            </button>
          ))}
        </div>
      </div>
      {indice >= 0 && (
        <VisualizadorMidia aberto onFechar={fechar} itens={itens} indice={indice} onIndiceChange={selecionar}
          acoesDoItem={renderizarDetalhes(fotos[indice], fechar)} />
      )}
    </div>
  );
}

function MiniaturaDoAlbum({ foto, indisponivel }: { foto: MensagemResposta; indisponivel: string }) {
  const [urlComErro, setUrlComErro] = useState<string | null>(null);
  const url = urlDaFoto(foto);
  if (!url || url === urlComErro || metadadosDaMidia(foto.midiaMetadados).indisponivel) {
    return <span title={indisponivel}><ImageOff className="size-6 text-muted-foreground" aria-hidden /></span>;
  }
  // eslint-disable-next-line @next/next/no-img-element -- URL temporária do storage autorizado ou prévia local
  return <img src={url} alt="" loading="lazy" onError={() => setUrlComErro(url)} className="size-full object-cover" />;
}
