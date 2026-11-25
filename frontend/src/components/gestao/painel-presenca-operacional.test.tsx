import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GestaoTextosSchema } from "@/lib/config/schema-gestao";
import { PainelPresencaOperacional } from "./painel-presenca-operacional";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/http-client", () => ({ apiFetch: api }));
// O calendário já tem teste próprio; fixe a data civil para exercitar o contrato do painel.
vi.mock("@/components/ui/seletor-data-hora", async (original) => ({
  ...(await original<typeof import("@/components/ui/seletor-data-hora")>()),
  SeletorDataHora: ({ onChange, placeholderData }: { onChange: (data: string) => void; placeholderData: string }) =>
    <button type="button" onClick={() => onChange("2050-01-01T12:30")}>{placeholderData}</button>,
}));
const textos = GestaoTextosSchema.parse(undefined).presencaOperacional;
const estado = {
  fuso: "America/Sao_Paulo",
  presenca: { statusEfetivo: "OFFLINE", presencaNoCrm: "OFFLINE", motivoRodizio: "SEM_PRESENCA_ONLINE",
    disponivelParaIa: true, podeAlterar: true, ajuste: null, validoAte: null },
};

function painel() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}>
    <PainelPresencaOperacional usuarioId="alvo-1" textos={textos} disponivelParaIa />
  </QueryClientProvider>);
}

describe("status operacional na ficha", () => {
  beforeEach(() => api.mockReset());

  it("mostra o aviso de Online manual e envia a validade civil no fuso apresentado", async () => {
    api.mockResolvedValueOnce(estado).mockResolvedValueOnce({
      ...estado,
      presenca: { ...estado.presenca, statusEfetivo: "ONLINE", ajuste: "ONLINE", validoAte: "2050-01-01T15:30:00Z" },
    });
    painel();
    fireEvent.click(await screen.findByRole("button", { name: "Alterar status" }));
    await escolher("Novo status", "Online");
    expect(screen.getByText(textos.onlineManual)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Válido até (America/Sao_Paulo)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Selecionar data" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar status" }));
    await waitFor(() => expect(api).toHaveBeenLastCalledWith("/api/v1/usuarios/alvo-1/status-operacional", {
      method: "PATCH", body: JSON.stringify({ status: "ONLINE", validoAte: "2050-01-01T12:30" }),
    }));
    await screen.findByRole("button", { name: "Alterar status" });
    expect(screen.getByText("Sem presença Online no CRM")).toBeInTheDocument();
  });

  it("exibe o motivo sem oferecer alteração se o servidor negar a alçada", async () => {
    api.mockResolvedValueOnce({ ...estado, presenca: { ...estado.presenca, podeAlterar: false } });
    painel();
    expect(await screen.findByText("Sem presença Online no CRM")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alterar status" })).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  });
});

async function escolher(campo: string, valor: string) {
  fireEvent.click(screen.getByRole("combobox", { name: campo }));
  const opcao = await screen.findByRole("option", { name: valor });
  fireEvent.pointerMove(opcao);
  fireEvent.pointerUp(opcao);
  fireEvent.keyDown(opcao, { key: "Enter" });
}
