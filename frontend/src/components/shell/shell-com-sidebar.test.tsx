"use client";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/lib/auth/auth-store";
import { EXPANSAO_DA_SIDEBAR } from "./expansao-da-sidebar";

const estadoSidebar = vi.hoisted(() => ({
  retraida: true,
  fixada: false,
  onAlternar: undefined as undefined | (() => void),
  onPonteiroEntrar: undefined as undefined | (() => void),
  onPonteiroSair: undefined as undefined | (() => void),
  onFocoDentro: undefined as undefined | (() => void),
  onFocoFora: undefined as undefined | (() => void),
}));
const rota = vi.hoisted(() => ({ atual: "/atendimentos" }));
const funcionalidades = vi.hoisted(() => ({ flags: [] as string[] }));
vi.mock("@/lib/config/use-funcionalidades", () => ({
  useFuncionalidadesHabilitadas: () => ({ data: funcionalidades.flags }),
}));
vi.mock("next/font/google", () => ({ Geist: () => ({ variable: "fonte-v2-de-teste" }) }));

vi.mock("next/navigation", () => ({ usePathname: () => rota.atual }));

vi.mock("@/components/shell/sidebar", () => ({
  Sidebar: ({
    retraida,
    fixada,
    onAlternar,
    onPonteiroEntrar,
    onPonteiroSair,
    onFocoDentro,
    onFocoFora,
  }: {
    retraida: boolean;
    fixada?: boolean;
    onAlternar: () => void;
    onPonteiroEntrar?: () => void;
    onPonteiroSair?: () => void;
    onFocoDentro?: () => void;
    onFocoFora?: () => void;
  }) => {
    estadoSidebar.retraida = retraida;
    estadoSidebar.fixada = Boolean(fixada);
    estadoSidebar.onAlternar = onAlternar;
    estadoSidebar.onPonteiroEntrar = onPonteiroEntrar;
    estadoSidebar.onPonteiroSair = onPonteiroSair;
    estadoSidebar.onFocoDentro = onFocoDentro;
    estadoSidebar.onFocoFora = onFocoFora;
    return (
      <aside
        data-testid="sidebar"
        data-state={retraida ? "collapsed" : "expanded"}
        data-fixada={fixada ? "true" : "false"}
        onMouseEnter={onPonteiroEntrar}
        onMouseLeave={onPonteiroSair}
      >
        <button
          type="button"
          aria-pressed={Boolean(fixada)}
          onClick={onAlternar}
        >
          pin
        </button>
        <span>Atendimentos</span>
      </aside>
    );
  },
}));

vi.mock("@/components/shell/navegacao-inferior", () => ({
  NavegacaoInferior: () => <nav data-testid="navegacao-inferior" />,
}));

vi.mock("@/components/auth/sinalizador-shell-pronto", () => ({
  SinalizadorShellPronto: () => null,
}));
// Estes testes verificam exclusivamente geometria/hover da shell; o aviso tem suite propria.
vi.mock("@/components/auth/aviso-conta-teste", () => ({ AvisoContaTeste: () => null }));

import { ShellComSidebar } from "./shell-com-sidebar";

function slotDaSidebar() {
  return document.querySelector("[data-slot='sidebar-slot']") as HTMLElement;
}

describe("ShellComSidebar", () => {
  let telaEstreita = false;
  let notificarMudanca: (() => void) | undefined;

  beforeEach(() => {
    funcionalidades.flags = [];
    rota.atual = "/atendimentos";
    telaEstreita = false;
    notificarMudanca = undefined;
    estadoSidebar.retraida = true;
    estadoSidebar.fixada = false;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: telaEstreita,
        addEventListener: (_evento: string, listener: () => void) => {
          notificarMudanca = listener;
        },
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({ usuarioId: null });
    localStorage.removeItem("synapse:densidade-listas:ana");
    localStorage.removeItem("synapse:aparencia:ana:tema");
    localStorage.removeItem("synapse:aparencia:ana:cor");
  });

  it("inicia a sidebar retraida em viewport largo", () => {
    render(
      <ShellComSidebar>
        <p>Conteúdo</p>
      </ShellComSidebar>,
    );

    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "collapsed");
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-fixada", "false");
    expect(slotDaSidebar()).toHaveStyle({ width: `${EXPANSAO_DA_SIDEBAR.larguraRetraidaPx}px` });
    expect(screen.queryByTestId("navegacao-inferior")).not.toBeInTheDocument();
  });

  it("usa a geometria da referência no Dashboard v2 sem alterar Atendimentos", () => {
    funcionalidades.flags = ["dashboard_layout_v2"];
    rota.atual = "/dashboard";
    const shell = render(<ShellComSidebar><p>Dashboard</p></ShellComSidebar>);
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "collapsed");
    expect(slotDaSidebar()).toHaveStyle({ width: "88px" });
    fireEvent.click(screen.getByRole("button", { name: "pin" }));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "expanded");
    expect(slotDaSidebar()).toHaveStyle({ width: "288px" });
    rota.atual = "/atendimentos";
    shell.rerender(<ShellComSidebar><p>Atendimentos</p></ShellComSidebar>);
    expect(slotDaSidebar()).toHaveStyle({ width: `${EXPANSAO_DA_SIDEBAR.larguraRetraidaPx}px` });
  });

  it.each([
    ["/agenda", "/cancelamentos", ["agenda_layout_v2", "gestao_layout_v2", "cancelamentos"]],
    ["/atendimentos", "/chat-interno", ["atendimentos_layout_v2", "chat_interno"]],
    ["/configuracoes", "/trocar-senha", []],
    ["/administracao", "/administracao/acessos", ["gestao_layout_v2"]],
    ["/campanhas", "/campanhas/nova", ["gestao_layout_v2"]],
  ])("mantém a sidebar V2 ao navegar de %s para %s", (origem, destino, flags) => {
    vi.useFakeTimers();
    rota.atual = origem;
    funcionalidades.flags = flags;
    const shell = render(<ShellComSidebar><p>Conteúdo</p></ShellComSidebar>);

    rota.atual = destino;
    shell.rerender(<ShellComSidebar><p>Conteúdo</p></ShellComSidebar>);
    expect(slotDaSidebar().closest("[data-slot='page-canvas']")).toHaveClass("fonte-v2-de-teste");
    expect(slotDaSidebar()).toHaveStyle({ width: "88px" });

    fireEvent.mouseEnter(screen.getByTestId("sidebar"));
    act(() => vi.advanceTimersByTime(EXPANSAO_DA_SIDEBAR.intencaoAbrirMs));
    expect(slotDaSidebar()).toHaveAttribute("data-sobreposta", "true");
    expect(slotDaSidebar()).toHaveStyle({ width: "88px" });

    fireEvent.mouseLeave(screen.getByTestId("sidebar"));
    act(() => vi.advanceTimersByTime(EXPANSAO_DA_SIDEBAR.atrasoFecharMs));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "collapsed");
  });

  it("aplica a densidade salva apenas na conta que escolheu modo compacto", () => {
    rota.atual = "/agenda";
    funcionalidades.flags = ["agenda_layout_v2"];
    localStorage.setItem("synapse:densidade-listas:ana", "compacta");
    useAuthStore.setState({ usuarioId: "ana" });
    render(<ShellComSidebar><p>Agenda</p></ShellComSidebar>);

    const canvas = slotDaSidebar().closest("[data-slot='page-canvas']");
    expect(canvas).toHaveAttribute("data-densidade", "compacta");

    act(() => useAuthStore.setState({ usuarioId: "bia" }));
    expect(canvas).not.toHaveAttribute("data-densidade");
  });

  it("aplica o tema e a cor da conta atual e restaura os padrões ao trocar de conta", () => {
    localStorage.setItem("synapse:aparencia:ana:tema", "escuro");
    localStorage.setItem("synapse:aparencia:ana:cor", "verde");
    useAuthStore.setState({ usuarioId: "ana" });
    render(<ShellComSidebar><p>Agenda</p></ShellComSidebar>);

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-cor-destaque", "verde");
    act(() => useAuthStore.setState({ usuarioId: "bia" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-cor-destaque", "azul");
  });

  it("abre a sidebar no Dashboard sem mudar o estado inicial de Atendimentos", () => {
    rota.atual = "/dashboard";
    render(<ShellComSidebar><p>Dashboard</p></ShellComSidebar>);

    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "expanded");
    expect(slotDaSidebar()).toHaveStyle({ width: `${EXPANSAO_DA_SIDEBAR.larguraExpandidaPx}px` });
    fireEvent.click(screen.getByRole("button", { name: "pin" }));
    expect(slotDaSidebar()).toHaveStyle({ width: `${EXPANSAO_DA_SIDEBAR.larguraRetraidaPx}px` });
  });

  it("hover abre em sobreposicao: slot fica em 76px e o chat nao e empurrado", () => {
    vi.useFakeTimers();
    render(
      <ShellComSidebar>
        <p>Conteúdo</p>
      </ShellComSidebar>,
    );

    fireEvent.mouseEnter(screen.getByTestId("sidebar"));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "collapsed");
    expect(slotDaSidebar()).toHaveStyle({ width: `${EXPANSAO_DA_SIDEBAR.larguraRetraidaPx}px` });

    act(() => vi.advanceTimersByTime(EXPANSAO_DA_SIDEBAR.intencaoAbrirMs));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "expanded");
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-fixada", "false");
    expect(slotDaSidebar()).toHaveStyle({ width: `${EXPANSAO_DA_SIDEBAR.larguraRetraidaPx}px` });
    expect(slotDaSidebar()).toHaveAttribute("data-expandida", "true");
    expect(slotDaSidebar()).toHaveAttribute("data-sobreposta", "true");
    expect(screen.getByText("Conteúdo")).toBeVisible();
  });

  it("mouse leave recolhe depois do atraso, sem fixar", () => {
    vi.useFakeTimers();
    render(
      <ShellComSidebar>
        <p>Conteúdo</p>
      </ShellComSidebar>,
    );

    fireEvent.mouseEnter(screen.getByTestId("sidebar"));
    act(() => vi.advanceTimersByTime(EXPANSAO_DA_SIDEBAR.intencaoAbrirMs));
    fireEvent.mouseLeave(screen.getByTestId("sidebar"));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "expanded");

    act(() => vi.advanceTimersByTime(EXPANSAO_DA_SIDEBAR.atrasoFecharMs));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "collapsed");
    expect(slotDaSidebar()).toHaveStyle({ width: `${EXPANSAO_DA_SIDEBAR.larguraRetraidaPx}px` });
  });

  it("expande com foco de teclado sem atraso e retrai ao perder o foco", () => {
    vi.useFakeTimers();
    render(
      <ShellComSidebar>
        <p>Conteúdo</p>
      </ShellComSidebar>,
    );

    act(() => estadoSidebar.onFocoDentro?.());
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "expanded");
    expect(slotDaSidebar()).toHaveStyle({ width: `${EXPANSAO_DA_SIDEBAR.larguraRetraidaPx}px` });
    expect(slotDaSidebar()).toHaveAttribute("data-sobreposta", "true");

    act(() => estadoSidebar.onFocoFora?.());
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "collapsed");
  });

  it("o botao de pin mantem a barra aberta depois de sair o ponteiro", () => {
    vi.useFakeTimers();
    render(
      <ShellComSidebar>
        <p>Conteúdo</p>
      </ShellComSidebar>,
    );

    fireEvent.click(screen.getByRole("button", { name: "pin" }));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "expanded");
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-fixada", "true");
    expect(screen.getByRole("button", { name: "pin" })).toHaveAttribute("aria-pressed", "true");
    expect(slotDaSidebar()).toHaveStyle({ width: `${EXPANSAO_DA_SIDEBAR.larguraExpandidaPx}px` });

    fireEvent.mouseLeave(screen.getByTestId("sidebar"));
    act(() => vi.advanceTimersByTime(EXPANSAO_DA_SIDEBAR.atrasoFecharMs));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "expanded");

    fireEvent.click(screen.getByRole("button", { name: "pin" }));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-fixada", "false");
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-state", "collapsed");
    expect(slotDaSidebar()).toHaveStyle({ width: `${EXPANSAO_DA_SIDEBAR.larguraRetraidaPx}px` });
  });

  it("cancela timers ao desmontar", () => {
    vi.useFakeTimers();
    const tela = render(
      <ShellComSidebar>
        <p>Conteúdo</p>
      </ShellComSidebar>,
    );

    fireEvent.mouseEnter(screen.getByTestId("sidebar"));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    tela.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("esconde a sidebar e mostra a barra inferior no viewport estreito", () => {
    render(
      <ShellComSidebar>
        <p>Conteúdo</p>
      </ShellComSidebar>,
    );

    telaEstreita = true;
    act(() => notificarMudanca?.());

    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-slot")).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot='sidebar-slot']")).toBeNull();
    expect(screen.getByTestId("navegacao-inferior")).toBeInTheDocument();
  });

  it("falha se o hover temporario deixar de sobrepor e voltar a empurrar o layout", () => {
    const pasta = dirname(fileURLToPath(import.meta.url));
    const shell = readFileSync(join(pasta, "shell-com-sidebar.tsx"), "utf8");
    const sidebar = readFileSync(join(pasta, "sidebar.tsx"), "utf8");
    expect(shell).toMatch(/estiloDaLarguraDoSlot/);
    expect(shell).toMatch(/data-sobreposta/);
    expect(sidebar).toMatch(/absolute inset-y-0 left-0 z-40/);
    expect(sidebar).toMatch(/estiloDoRotuloDaSidebar/);
  });

  /*
   * jsdom não faz layout: não dá para medir scrollHeight aqui e provar a rolagem. O que este
   * teste protege é a única causa real já diagnosticada — sem `shrink-0` nos filhos diretos, o
   * flex column encolhe a página inteira até caber e nada rola. A prova de comportamento é a
   * medição no navegador, refeita contra o shell desta merge (sidebar retraída/sobreposta, E84c)
   * e registrada no relatório da etapa. Se alguém remover a classe, este teste reprova.
   */
  it("a superficie de pagina nao deixa o filho direto encolher — sem isso a pagina nao rola", () => {
    const { container } = render(
      <ShellComSidebar>
        <p>Conteúdo</p>
      </ShellComSidebar>,
    );

    const superficie = container.querySelector('[data-slot="page-surface"]');
    expect(superficie).toHaveClass("overflow-y-auto");
    expect(superficie).toHaveClass("[&>*]:shrink-0");
  });
});
