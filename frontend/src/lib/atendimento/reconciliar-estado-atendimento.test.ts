import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CartaoAtendimento,
  EstadoAtendimentoSelecionado,
  EventoCanonicoAtendimentoTempoReal,
} from "./types";
import { atualizarPainelDeAtendimentos, pedidoDaNotificacao } from "./atualizacao-do-painel";

const obterEstado = vi.hoisted(() => vi.fn());

vi.mock("./api", () => ({
  obterEstadoAtendimento: obterEstado,
}));

import {
  chaveEstadoAtendimento,
  ReconciliadorEstadoAtendimento,
} from "./reconciliar-estado-atendimento";

const cartao: CartaoAtendimento = {
  atendimentoId: "atendimento-1",
  leadId: "lead-1",
  leadNome: "Lead",
  leadFotoUrl: null,
  leadEmpresa: null,
  canalTipo: "WHATSAPP",
  etapaId: null,
  etapaNome: null,
  etapaCor: null,
  status: "EM_ATENDIMENTO",
  atendenteId: "atendente-1",
  atendenteNome: "Ana",
  ultimaMensagemPreview: null,
  ultimaMensagemRemetenteTipo: null,
  ultimaMensagemEm: null,
  ultimaMensagemDoLeadEm: null,
  naoLidas: 0,
};

function snapshot(versao: number): EstadoAtendimentoSelecionado {
  return {
    cartao,
    versao,
    participantes: [],
    usuarioAtualEhResponsavel: true,
    usuarioAtualParticipa: false,
    podeEnviar: true,
  };
}

function evento(eventoId: string, versao: number): EventoCanonicoAtendimentoTempoReal {
  return {
    tipo: "ATENDIMENTO_ESTADO",
    contrato: "atendimento.estado.v1",
    eventoId,
    versaoContrato: 1,
    dados: {
      atendimentoId: cartao.atendimentoId,
      leadId: cartao.leadId,
      eventoTipo: "ATENDIMENTO_TRANSFERIDO",
      versao,
      ocorridoEm: "2026-09-12T10:00:00Z",
    },
  };
}

describe("ReconciliadorEstadoAtendimento", () => {
  let cache: QueryClient;
  let reconciliador: ReconciliadorEstadoAtendimento;

  beforeEach(() => {
    cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    reconciliador = new ReconciliadorEstadoAtendimento(cache);
    obterEstado.mockReset();
  });

  it("resposta em voo não recoloca dados no cache depois de revogação", async () => {
    let resolver!: (valor: EstadoAtendimentoSelecionado) => void;
    obterEstado.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve; }));
    const antiga = reconciliador.sincronizar(cartao.atendimentoId);
    const rejeicao = expect(antiga).rejects.toThrow("descartada");
    reconciliador.descartar(cartao.atendimentoId);
    resolver(snapshot(2));
    await rejeicao;
    expect(reconciliador.ultimoSnapshot(cartao.atendimentoId)).toBeNull();
    obterEstado.mockResolvedValue(snapshot(3));
    await reconciliador.sincronizar(cartao.atendimentoId);
    expect(reconciliador.ultimoSnapshot(cartao.atendimentoId)?.versao).toBe(3);
  });

  it("processa cada eventId uma única vez", async () => {
    obterEstado.mockResolvedValue(snapshot(2));

    await reconciliador.receber(evento("evento-1", 2));
    await reconciliador.receber(evento("evento-1", 2));

    expect(obterEstado).toHaveBeenCalledTimes(1);
    expect(cache.getQueryData(chaveEstadoAtendimento(cartao.atendimentoId))).toEqual(snapshot(2));
  });

  it("descarta evento com versão anterior ao snapshot conhecido", async () => {
    reconciliador.registrarSnapshot(snapshot(5));

    await reconciliador.receber(evento("evento-antigo", 4));

    expect(obterEstado).not.toHaveBeenCalled();
  });

  it("colapsa concorrência e busca novamente se chegar uma versão maior durante o fetch", async () => {
    let resolverPrimeiro!: (valor: EstadoAtendimentoSelecionado) => void;
    obterEstado
      .mockImplementationOnce(() => new Promise((resolve) => { resolverPrimeiro = resolve; }))
      .mockResolvedValueOnce(snapshot(3));

    const primeiro = reconciliador.receber(evento("evento-2", 2));
    const segundo = reconciliador.receber(evento("evento-3", 3));
    resolverPrimeiro(snapshot(2));
    await Promise.all([primeiro, segundo]);

    expect(obterEstado).toHaveBeenCalledTimes(2);
    expect(cache.getQueryData(chaveEstadoAtendimento(cartao.atendimentoId))).toEqual(snapshot(3));
  });

  it("coalesce a invalidação do evento do ouvinte global e não busca snapshot de outra conversa", () => {
    const invalidar = vi.spyOn(cache, "invalidateQueries");
    const remoto = evento("evento-remoto", 2);

    expect(reconciliador.registrarSemSnapshot(remoto)).toBe(true);
    atualizarPainelDeAtendimentos(cache, pedidoDaNotificacao(remoto));
    expect(reconciliador.registrarSemSnapshot(remoto)).toBe(false);

    expect(obterEstado).not.toHaveBeenCalled();
    expect(invalidar.mock.calls).toHaveLength(2); // lista e contagem, uma vez cada
    expect(invalidar.mock.calls.every(([, opcoes]) => opcoes?.cancelRefetch === false)).toBe(true);
  });

  it("uma simples leitura/revalidação do estado não provoca releitura da inbox", async () => {
    obterEstado.mockResolvedValue(snapshot(2));
    const invalidar = vi.spyOn(cache, "invalidateQueries");
    await reconciliador.sincronizar(cartao.atendimentoId);
    expect(invalidar).not.toHaveBeenCalled();
  });
});
