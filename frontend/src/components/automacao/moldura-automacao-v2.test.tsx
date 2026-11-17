import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shell/cabecalho-lista-v2", () => ({ CabecalhoListaV2: () => null }));
vi.mock("@/lib/gestao/use-capacidades", () => ({ useCapacidades: () => ({ pode: () => true }) }));
vi.mock("@/lib/config/textos-provider", () => ({
  useTextos: () => ({
    menu: { grupoGestao: "Gestão" },
    gestao: { v2: { buscaGlobal: "Buscar" } },
    automacao: {
      titulo: "Automação",
      emBreve: { selo: "Em breve", personalidade: "Personalidade da IA", parametro: "Sem efeito." },
    },
  }),
}));

import { MolduraAutomacaoV2 } from "./moldura-automacao-v2";

describe("MolduraAutomacaoV2", () => {
  it("mostra Mensagens do sistema e Personalidade da IA desabilitadas com o selo Em breve", () => {
    const selecionar = vi.fn();
    render(
      <MolduraAutomacaoV2 aba="geral" onSelecionar={selecionar} resumo={null}>
        <p>Conteúdo</p>
      </MolduraAutomacaoV2>,
    );

    const sistema = screen.getByRole("button", { name: /Mensagens do sistema/ });
    const personalidade = screen.getByRole("button", { name: /Personalidade da IA/ });
    for (const item of [sistema, personalidade]) {
      expect(item).toBeDisabled();
      expect(item).toHaveTextContent("Em breve");
    }
    fireEvent.click(sistema);
    expect(selecionar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Follow-up/ }));
    expect(selecionar).toHaveBeenCalledWith("followUp");
  });
});
