import type { MensagemResposta } from "./types";

export const MINIMO_FOTOS_DO_ALBUM = 4;

export type LinhaComFoto = {
  tipo: "mensagem";
  chave: string;
  mensagem: MensagemResposta;
};

type LinhaDeOutraEspecie = { tipo: "cartao" };

export type AlbumDeFotos<L extends LinhaComFoto> = {
  tipo: "album";
  chave: string;
  primeiraLinha: L;
  fotos: MensagemResposta[];
};

function loteDaFoto(foto: MensagemResposta): string | null {
  if (foto.citacao?.tipoReferencia === "ENCAMINHAMENTO") return null;
  try {
    const lote = foto.midiaMetadados ? JSON.parse(foto.midiaMetadados)?.loteFotosId : null;
    return typeof lote === "string" && lote.length > 0 ? lote : null;
  } catch {
    return null;
  }
}

/** O histórico já chega ordenado e desduplicado. Nenhuma consulta ou mutação por álbum. */
export function agruparFotos<L extends LinhaComFoto, C extends LinhaDeOutraEspecie>(
  linhas: ReadonlyArray<L | C>,
  janelaSegundos: number,
  dia: (iso: string) => string,
  idsExtras: ReadonlySet<string> = new Set(),
): Array<L | C | AlbumDeFotos<L>> {
  const resultado: Array<L | C | AlbumDeFotos<L>> = [];
  let bloco: L[] = [];
  let lote: string | null = null;

  function fecharBloco() {
    if (bloco.length >= MINIMO_FOTOS_DO_ALBUM) {
      const primeiraLinha = bloco[0];
      resultado.push({
        tipo: "album",
        chave: primeiraLinha.chave,
        primeiraLinha,
        fotos: bloco.map(({ mensagem }) => mensagem),
      });
    } else {
      resultado.push(...bloco);
    }
    bloco = [];
    lote = null;
  }

  for (const linha of linhas) {
    if (linha.tipo !== "mensagem" || linha.mensagem.tipo !== "IMAGEM" || idsExtras.has(linha.mensagem.id)) {
      fecharBloco();
      resultado.push(linha);
      continue;
    }
    const foto = linha.mensagem;
    const loteDaAtual = loteDaFoto(foto);
    const primeira = bloco[0]?.mensagem;
    const instante = Date.parse(foto.enviadoEm);
    if (primeira && (
      primeira.remetenteTipo !== foto.remetenteTipo
      // O domínio identifica o cliente pela própria conversa: Remetente.lead() não guarda ID.
      || primeira.remetenteId !== foto.remetenteId
      || (foto.remetenteTipo !== "LEAD" && !foto.remetenteId)
      || primeira.atendimentoId !== foto.atendimentoId
      || dia(primeira.enviadoEm) !== dia(foto.enviadoEm)
      || lote !== loteDaAtual
      || (lote === null && (
        foto.remetenteTipo !== "LEAD" || janelaSegundos <= 0
        || !(Math.abs(instante - Date.parse(primeira.enviadoEm)) <= janelaSegundos * 1000)
      ))
    )) fecharBloco();
    lote = loteDaAtual;
    bloco.push(linha);
  }
  fecharBloco();
  return resultado;
}
