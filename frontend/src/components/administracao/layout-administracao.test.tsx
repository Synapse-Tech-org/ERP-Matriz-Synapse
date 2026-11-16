import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/administracao/feedbacks" }));

const funcionalidades = vi.hoisted(() => ({ data: [] as string[] }));
vi.mock("@/lib/config/use-funcionalidades", () => ({ useFuncionalidadesHabilitadas: () => funcionalidades }));
vi.mock("@/components/notificacoes/central-de-avisos", () => ({ CentralDeAvisos: () => null }));

vi.mock("@/lib/config/textos-provider", () => ({
  useTextos: () => ({
    menu: { grupoGestao: "Gestão", grupoPrincipal: "Principal", itens: { atendimentos: "Atendimentos" } },
    administracao: {
      titulo: "Administração",
      descricao: "Área administrativa",
      estadoSistema: "Estado não verificado",
      navegacao: "Áreas da Administração",
      abas: { visaoGeral: "Visão geral", acessos: "Acessos", feedbacks: "Feedbacks" },
      abasDescricoes: {
        visaoGeral: "Usuários e recursos habilitados",
        acessos: "Gerenciar logins",
        feedbacks: "Sugestões e erros",
      },
    },
  }),
}));

import { LayoutAdministracao } from "./layout-administracao";

describe("LayoutAdministracao", () => {
  afterEach(() => { funcionalidades.data = []; });

  it("mantém navegação interna acessível e marca a rota atual", () => {
    render(
      <LayoutAdministracao>
        <p>Conteúdo</p>
      </LayoutAdministracao>,
    );

    expect(screen.getByRole("navigation", { name: "Áreas da Administração" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("bg-[var(--fundo-canvas)]", "overflow-x-hidden");
    expect(screen.getByRole("navigation", { name: "Áreas da Administração" })).toHaveClass(
      "sm:w-[266px]",
    );
    const feedbacks = screen.getByRole("link", { name: /Feedbacks/ });
    expect(feedbacks).toHaveAttribute("aria-current", "page");
    expect(feedbacks).toHaveClass("bg-cor-ia/10", "text-cor-ia");
    expect(screen.getByRole("link", { name: /Acessos/ })).toHaveAttribute("href", "/administracao/acessos");
    const areaForaDoEscopo = new RegExp(["tutoriais", "documentação"].join(".*"), "i");
    expect(screen.queryByText(areaForaDoEscopo)).not.toBeInTheDocument();
  });

  it("exibe somente Administração, sem selo de acesso restrito", () => {
    render(
      <LayoutAdministracao>
        <p>Conteúdo</p>
      </LayoutAdministracao>,
    );

    expect(screen.getByRole("heading", { name: "Administração" })).toBeInTheDocument();
    expect(screen.queryByText("Acesso restrito")).not.toBeInTheDocument();
    expect(screen.getByText("Estado não verificado")).toBeInTheDocument();
  });

  it("no layout V2 troca a barra e o menu lateral por trilha e abas no cabeçalho", () => {
    funcionalidades.data = ["gestao_layout_v2"];
    render(
      <LayoutAdministracao>
        <p>Conteúdo</p>
      </LayoutAdministracao>,
    );

    expect(screen.getByRole("main")).toHaveAttribute("data-layout", "v2");
    expect(screen.getByRole("heading", { level: 1, name: "Administração" })).toBeInTheDocument();
    const abas = screen.getByRole("navigation", { name: "Áreas da Administração" });
    expect(abas).not.toHaveClass("sm:w-[266px]");
    expect(within(abas).getByRole("link", { name: "Feedbacks" })).toHaveAttribute("aria-current", "page");
    expect(within(abas).getByRole("link", { name: "Visão geral" })).toHaveAttribute("href", "/administracao");
    expect(within(abas).getByRole("link", { name: "Acessos" })).not.toHaveAttribute("aria-current");
    const trilha = screen.getByRole("navigation", { name: "Feedbacks" });
    expect(trilha).toHaveTextContent("Gestão");
    expect(within(trilha).getByText("Feedbacks")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Estado não verificado")).toBeInTheDocument();
    expect(screen.queryByText("Sugestões e erros")).not.toBeInTheDocument();
    expect(screen.queryByText("Acesso restrito")).not.toBeInTheDocument();
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
  });
});
