import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { campanhaDeTeste } from "@/test/fabricas-de-campanha";
import { textosReais } from "@/test/textos-reais";

vi.mock("@/lib/auth/auth-store", () => ({
  useAuthStore: (seletor: (e: { papel: string; status: string }) => unknown) =>
    seletor({ papel: "ADMINISTRADOR", status: "autenticado" }),
}));
vi.mock("@/lib/config/textos-provider", () => ({ useTextos: () => textosReais }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

import { TabelaDeCampanhas } from "./tabela-de-campanhas";

const colunas = textosReais.campanhas.lista.colunas;
const indicadores = textosReais.campanhas.indicadores;

describe("tabela de campanhas", () => {
  it("fora do V2 mantém template e limite diário em colunas próprias", () => {
    render(<TabelaDeCampanhas campanhas={[campanhaDeTeste()]} />);

    expect(screen.getByRole("columnheader", { name: colunas.template })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: colunas.limite })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: indicadores.lidas })).not.toBeInTheDocument();
  });

  it("no V2 junta template ao nome e mostra leitura e respostas sobre o que foi enviado", () => {
    render(<TabelaDeCampanhas v2 campanhas={[campanhaDeTeste()]} />);

    expect(screen.queryByRole("columnheader", { name: colunas.template })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: colunas.limite })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: indicadores.lidas })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: indicadores.respostas })).toBeInTheDocument();

    const linha = screen.getAllByRole("row")[1];
    expect(within(linha).getByRole("link", { name: "Retorno de orçamentos" })).toBeInTheDocument();
    expect(within(linha).getByText("retorno_orcamento")).toBeInTheDocument();
    // 30 lidos e 10 respostas sobre 80 enviados; 80 enviados de 200 no progresso.
    expect(within(linha).getByText("38%")).toBeInTheDocument();
    expect(within(linha).getByText("13%")).toBeInTheDocument();
    expect(within(linha).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    expect(within(linha).getByText("40%")).toBeInTheDocument();
  });

  it("no V2 não inventa taxa quando nada foi enviado", () => {
    const semEnvio = campanhaDeTeste({
      status: "RASCUNHO",
      contadores: { ...campanhaDeTeste().contadores, enviados: 0, lidos: 0, respondidos: 0 },
    });
    render(<TabelaDeCampanhas v2 campanhas={[semEnvio]} />);

    const linha = screen.getAllByRole("row")[1];
    expect(within(linha).getAllByText("—")).toHaveLength(2);
    expect(within(linha).queryByText("NaN%")).not.toBeInTheDocument();
  });
});
