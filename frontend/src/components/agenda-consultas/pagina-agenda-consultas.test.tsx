import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { textosReais } from "@/test/textos-reais";
import { definirCapacidadesDeTeste } from "@/test/capacidades-de-teste";
import Pagina from "@/app/(shell)/agenda-consultas/page";

const flags = vi.hoisted(() => ({ data: [] as string[] }));
const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/config/use-funcionalidades", () => ({ useFuncionalidadesHabilitadas: () => flags }));
vi.mock("@/lib/config/textos-provider", () => ({ useTextos: () => textosReais }));
vi.mock("@/lib/api/http-client", () => ({ apiFetch: api }));
vi.mock("@/components/shell/cabecalho-lista-v2", () => ({ CabecalhoListaV2: () => null }));

const t = textosReais.agendaConsultas;
const dia = "2026-11-14";
const consulta = {
  id: "consulta-1", leadId: "cadastro-1", paciente: "Paciente sintético", inicio: dia + "T13:00:00Z",
  profissional: "Equipe teste", tipo: "Consulta", cobertura: null, estado: "AGENDADO", revisao: 2,
};

async function montar(estado?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pagina = await Pagina({ searchParams: Promise.resolve({ estado }) });
  return render(<QueryClientProvider client={client}>{pagina}</QueryClientProvider>);
}

describe("Agenda de consultas pela rota real", () => {
  beforeEach(() => {
    api.mockReset();
    flags.data = ["variante_clinica"];
    definirCapacidadesDeTeste({ negadas: [] });
    api.mockResolvedValue({ dia, hoje: dia, fusoHorario: "America/Sao_Paulo", agenda: { itens: [consulta] } });
  });

  it("não consulta dados quando a variante está desligada ou o acesso a clientes foi revogado", async () => {
    flags.data = [];
    const { unmount } = await montar();
    expect(screen.getByText(t.desativada)).toBeInTheDocument();
    unmount();

    flags.data = ["variante_clinica"];
    definirCapacidadesDeTeste({ negadas: ["clientes.acessar"] });
    await montar();
    expect(screen.getByText(textosReais.gestao.acesso.semAcessoTitulo)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("aplica o filtro da URL e impede editar em uma sessão somente de leitura", async () => {
    definirCapacidadesDeTeste({ negadas: ["contatos.editar"] });
    await montar("CANCELADO");
    await screen.findAllByText(consulta.paciente);
    expect(api).toHaveBeenCalledWith("/api/v1/agenda-consultas?estado=CANCELADO", expect.anything());
    expect(screen.queryByRole("button", { name: t.nova })).not.toBeInTheDocument();
  });

  it("confirma com a revisão exibida e busca a agenda atualizada", async () => {
    await montar();
    const botoes = await screen.findAllByRole("button", { name: t.abrir });
    fireEvent.click(botoes[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t.transicoes.CONFIRMADO }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/v1/agenda-consultas/consulta-1", {
      method: "PATCH", body: JSON.stringify({ revisao: 2, estado: "CONFIRMADO" }),
    }));
    await waitFor(() => expect(api.mock.calls.filter(([url]) => url === "/api/v1/agenda-consultas?")).toHaveLength(2));
  });
});
