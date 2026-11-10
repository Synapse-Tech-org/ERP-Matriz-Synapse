import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { definirCapacidadesDeTeste } from "@/test/capacidades-de-teste";

const atualizarMutate = vi.fn();
const editarMutate = vi.fn();
const removerMutate = vi.fn();
const listarLembretesMock = vi.fn();

const LEMBRETES = {
  lembretes: [
    {
      id: "r1",
      leadId: "l1",
      leadNome: "Marcos Vinícius",
      atendenteId: "u1",
      atendenteNome: "Ana Beatriz",
      texto: "Retomar atendimento transferido",
      dataHora: "2026-01-10T08:05:00Z",
      origemAutomatica: true,
      status: "PENDENTE",
    },
    {
      id: "r2",
      leadId: "l2",
      leadNome: null,
      atendenteId: "u1",
      atendenteNome: "Ana Beatriz",
      texto: "Revisar tabela de preços",
      dataHora: "2026-01-11T09:00:00Z",
      origemAutomatica: false,
      status: "CONCLUIDO",
    },
  ],
  pagina: 0,
  temMais: false,
};

const v2 = vi.hoisted(() => ({ ativo: false }));
vi.mock("@/lib/config/use-funcionalidades", () => ({
  useFuncionalidadesHabilitadas: () => ({ data: v2.ativo ? ["recursos_layout_v2"] : [] }),
}));
vi.mock("@/components/shell/cabecalho-lista-v2", () => ({ CabecalhoListaV2: () => null }));
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipe: () => ({ data: [{ id: "u1", nome: "Ana Beatriz" }] }) }));
afterEach(() => { v2.ativo = false; });

vi.mock("@/lib/auth/auth-store", () => ({
  useAuthStore: (selector: (s: { papel: string }) => unknown) => selector({ papel: "GESTOR" }),
}));

vi.mock("@/lib/config/textos-provider", () => ({
  useTextos: () => ({
    lembretes: {
      v2: {"buscar":"Buscar lembrete ou lead","todosAtendentes":"Todos os atendentes","soAutomaticos":"Somente automáticos","hoje":"Hoje","amanha":"Amanhã","proximos":"Próximos dias","concluidos":"Concluídos","adiar":"Adiar","adiarPara":"Adiar para","adiarHora":"1 hora","segunda":"Segunda","reabrir":"Reabrir","editar":"Editar","periodoInvalido":"A data final deve ser igual ou posterior à inicial."},
      titulo: "Lembretes",
      descricao: "Compromissos pessoais ligados aos seus leads.",
      novo: "Novo lembrete",
      carregando: "Carregando lembretes...",
      vazio: "Nenhum lembrete neste período.",
      erro: "Não foi possível carregar os lembretes.",
      automatico: "Automático",
      concluir: "Concluir",
      remover: "Remover",
      status: { pendente: "Pendente", concluido: "Concluído" },
      filtros: { inicio: "De", fim: "Até", status: "Status", todos: "Todos" },
      semVinculo: "Sem vínculo",
      colunas: {
        texto: "Lembrete",
        lead: "Lead vinculado",
        dataHora: "Data e hora",
        status: "Status",
        atendente: "Atendente",
        acoes: "Ações",
      },
      paginacao: { anterior: "Anterior", proxima: "Próxima" },
      formulario: {
        titulo: "Criar lembrete",
        lead: "Lead",
        selecionarLead: "Selecione um lead",
        dataHora: "Data e hora",
        texto: "Texto",
        salvar: "Salvar",
        cancelar: "Cancelar",
        erro: "Não foi possível criar o lembrete.",
      },
    },
  }),
}));

vi.mock("@/lib/suporte/api", () => ({
  listarLembretes: (...args: unknown[]) => {
    listarLembretesMock(...args);
    return Promise.resolve(LEMBRETES);
  },
  atualizarLembrete: (...args: unknown[]) => {
    atualizarMutate(...args);
    return Promise.resolve();
  },
  editarLembrete: (...args: unknown[]) => {
    editarMutate(...args);
    return Promise.resolve();
  },
  removerLembrete: (...args: unknown[]) => {
    removerMutate(...args);
    return Promise.resolve();
  },
  criarLembrete: vi.fn(),
}));

vi.mock("@/lib/atendimento/api", () => ({ listarAtendimentos: vi.fn(() => Promise.resolve([])) }));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PaginaLembretes } from "./pagina-lembretes";

function renderComQuery() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <PaginaLembretes />
    </QueryClientProvider>,
  );
}

describe("pagina de lembretes", () => {
  it("no V2 pesquisa no servidor, agrupa, adia e reabre", async () => {
    v2.ativo = true;
    renderComQuery();
    expect(await screen.findByRole("rowheader", { name: "Hoje" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Concluídos" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Somente automáticos" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar lembrete ou lead" }), { target: { value: "retomar" } });
    await waitFor(() => expect(listarLembretesMock).toHaveBeenCalledWith(expect.objectContaining({
      busca: "retomar", origemAutomatica: true, pagina: 0,
    })));
    fireEvent.click(await screen.findByRole("button", { name: "Adiar" }));
    expect(screen.getByRole("button", { name: "Amanhã" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Segunda" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1 hora" }));
    await waitFor(() => expect(editarMutate).toHaveBeenCalledWith("r1", expect.objectContaining({
      status: "PENDENTE", dataHora: expect.any(String),
    })));
    fireEvent.click(screen.getByRole("button", { name: "Concluídos" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reabrir" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    await waitFor(() => expect(atualizarMutate).toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }), "PENDENTE"));
  });

  it("lista os lembretes como cards, com lead, status e badge de automático", async () => {
    renderComQuery();

    expect(await screen.findByText("Retomar atendimento transferido")).toBeInTheDocument();
    expect(screen.getByText("Marcos Vinícius")).toBeInTheDocument();
    expect(screen.getByText("Automático")).toBeInTheDocument();
    expect(screen.getAllByText("Pendente").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Concluído").length).toBeGreaterThan(0);
    expect(screen.getByText("Sem vínculo")).toBeInTheDocument();
  });

  it("conclui um lembrete pendente", async () => {
    renderComQuery();

    await screen.findByText("Retomar atendimento transferido");
    const botoesConcluir = screen.getAllByRole("button", { name: "Concluir" });
    fireEvent.click(botoesConcluir[0]);

    await waitFor(() => expect(atualizarMutate).toHaveBeenCalled());
  });

  it("remove um lembrete", async () => {
    renderComQuery();

    await screen.findByText("Retomar atendimento transferido");
    fireEvent.click(
      screen.getByRole("button", { name: "Remover Retomar atendimento transferido" }),
    );

    await waitFor(() => expect(removerMutate).toHaveBeenCalledWith("r1", expect.anything()));
  });

  it("sem criar e editar/excluir, mostra os lembretes sem concluir, remover nem criar", async () => {
    definirCapacidadesDeTeste({ negadas: ["lembretes.criar", "lembretes.editar_excluir"] });
    renderComQuery();

    expect(await screen.findByText("Retomar atendimento transferido")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Novo lembrete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover Retomar atendimento transferido" })).not.toBeInTheDocument();
  });
});
