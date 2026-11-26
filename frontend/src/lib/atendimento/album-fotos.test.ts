import { describe, expect, it } from "vitest";

import { agruparFotos } from "./album-fotos";
import type { MensagemResposta } from "./types";

export function fotoTeste(i: number, valores: Partial<MensagemResposta> = {}): MensagemResposta {
  return {
    id: `foto-${i}`, atendimentoId: "atendimento", remetenteTipo: "LEAD", remetenteId: "lead",
    remetenteNome: null, tipo: "IMAGEM", conteudo: null, midiaUrl: null, midiaMetadados: null,
    opcoes: null, statusEntrega: "ENTREGUE", erroEntrega: null,
    enviadoEm: new Date(Date.UTC(2026, 10, 26, 12, 0, i)).toISOString(), ...valores,
  };
}

const fotos = (n: number, valores?: Partial<MensagemResposta>) =>
  Array.from({ length: n }, (_, i) => fotoTeste(i, valores));
const compactar = (mensagens: MensagemResposta[], janela = 5) => agruparFotos(
  mensagens.map((mensagem) => ({ tipo: "mensagem" as const, chave: mensagem.id, mensagem })),
  janela, (iso) => iso.slice(0, 10),
);

describe("álbuns no histórico", () => {
  it("promove 3 → 4 → 5 fotos mantendo a ordem e a chave da primeira foto", () => {
    expect(compactar(fotos(3))).toHaveLength(3);
    expect(compactar(fotos(4))).toEqual([
      { tipo: "album", chave: "foto-0", fotos: fotos(4), primeiraLinha: expect.anything() },
    ]);
    expect(compactar(fotos(5))).toEqual([
      { tipo: "album", chave: "foto-0", fotos: fotos(5), primeiraLinha: expect.anything() },
    ]);
  });

  it.each([
    { tipo: "TEXTO" }, { tipo: "AUDIO" }, { tipo: "DOCUMENTO" },
    { remetenteId: "outro" }, { remetenteTipo: "ATENDENTE" },
    { atendimentoId: "outro" }, { enviadoEm: "2026-11-27T00:00:00Z" },
  ] satisfies Array<Partial<MensagemResposta>>)("delimita um álbum: %o", (divisor) => {
    const base = fotos(7, { midiaMetadados: '{"loteFotosId":"lote"}' });
    base[3] = { ...base[3], ...divisor };
    expect(compactar(base)).toHaveLength(7);
  });

  it("junta páginas consecutivas; mídia indisponível mantém sua posição dentro do álbum", () => {
    const mensagens = fotos(5, { remetenteId: null });
    mensagens[2].midiaMetadados = '{"indisponivel":true}';
    expect(compactar([...mensagens.slice(0, 2), ...mensagens.slice(2)])[0]).toMatchObject({
      tipo: "album", fotos: mensagens,
    });
  });

  it("limita o intervalo total, incluindo configuração zero, e não encadeia intervalos curtos", () => {
    expect(compactar([0, 2, 4, 6].map((i) => fotoTeste(i)))).toHaveLength(4);
    expect(compactar(fotos(4), 0)).toHaveLength(4);
  });

  it("usa lote explícito acima da janela e não junta cliques próximos ou saídas sem lote", () => {
    const saidas = (loteFotosId?: string) => ({ remetenteTipo: "ATENDENTE" as const,
      remetenteId: "atendente", midiaMetadados: JSON.stringify({ loteFotosId }) });
    expect(compactar(fotos(4, saidas()))).toHaveLength(4);
    expect(compactar([0, 4, 8, 12].map((i) => fotoTeste(i, saidas("A"))), 0)).toHaveLength(1);
    expect(compactar([0, 1, 2, 3].map((i) => fotoTeste(i, saidas(i < 2 ? "A" : "B"))))).toHaveLength(4);
  });
});
