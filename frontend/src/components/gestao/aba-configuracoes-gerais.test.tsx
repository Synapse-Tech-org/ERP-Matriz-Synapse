import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParametroAutomacao } from "@/lib/automacao/types";
import { GestaoTextosSchema } from "@/lib/config/schema-gestao";

const TEXTOS = GestaoTextosSchema.parse(undefined);
const estado = vi.hoisted(() => ({ parametros: [] as ParametroAutomacao[], mutate: vi.fn() }));

vi.mock("@/lib/automacao/use-automacao", () => ({
  useConfiguracaoAutomacao: () => ({ data: estado.parametros, isLoading: false, isError: false, refetch: vi.fn() }),
  useAtualizarParametroAutomacao: () => ({ mutate: estado.mutate, isPending: false, isError: false }),
}));

import { AbaConfiguracoesGerais } from "./aba-configuracoes-gerais";

function parametro(chave: string, valor: string, extra: Partial<ParametroAutomacao> = {}): ParametroAutomacao {
  return {
    chave, valor, unidade: null, tipo: valor === "true" || valor === "false" ? "BOOLEAN" : "TEXT",
    valorMin: null, valorMax: null, descricao: null, atualizadoEm: "2026-11-18T00:00:00Z", ...extra,
  };
}

const BASE = [
  parametro("atendimento.finalizar_fim_expediente.habilitado", "false"),
  parametro("atendimento.finalizar_fim_expediente.usar_expediente", "true"),
  parametro("atendimento.finalizar_fim_expediente.horario", "18:00"),
  parametro("atendimento.finalizar_inativos.habilitado", "true"),
  parametro("atendimento.finalizar_apos_horas", "24", { tipo: "INT", valorMin: 1, valorMax: 720 }),
  parametro("alerta.horario_cliente.inicio", "08:00"),
  parametro("alerta.horario_cliente.fim", "18:30"),
  parametro("alerta.horario_cliente.sab", "08:00-12:00"),
  parametro("avaliacao_atendimento.habilitada", "false"),
];

describe("AbaConfiguracoesGerais", () => {
  beforeEach(() => {
    estado.parametros = BASE;
    estado.mutate.mockReset();
  });

  it("liga a finalização no fim do expediente pela chave do backend", () => {
    render(<AbaConfiguracoesGerais textos={TEXTOS} editavel />);

    fireEvent.click(screen.getByRole("switch", { name: TEXTOS.configuracoesGerais.fimExpediente.titulo }));

    expect(estado.mutate).toHaveBeenCalledWith({ chave: "atendimento.finalizar_fim_expediente.habilitado", valor: "true" });
  });

  it("com o toggle ligado e horário fixo, mostra o campo de horário", () => {
    estado.parametros = BASE.map((p) => p.chave.endsWith("fim_expediente.habilitado") ? { ...p, valor: "true" }
      : p.chave.endsWith("usar_expediente") ? { ...p, valor: "false" } : p);

    render(<AbaConfiguracoesGerais textos={TEXTOS} editavel />);

    expect(screen.getByLabelText(TEXTOS.configuracoesGerais.fimExpediente.horario)).toHaveValue("18:00");
  });

  it("valida a faixa do limite de horas antes de salvar", () => {
    render(<AbaConfiguracoesGerais textos={TEXTOS} editavel />);
    const campo = screen.getByLabelText(TEXTOS.configuracoesGerais.inativos.limite);

    fireEvent.change(campo, { target: { value: "900" } });
    expect(screen.getByRole("button", { name: TEXTOS.configuracoesGerais.salvar })).toBeDisabled();
    expect(screen.getByText("Use um valor entre 1 e 720.")).toBeInTheDocument();

    fireEvent.change(campo, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: TEXTOS.configuracoesGerais.salvar }));
    expect(estado.mutate).toHaveBeenCalledWith({ chave: "atendimento.finalizar_apos_horas", valor: "12" });
  });

  it("salva o horário próprio de um dia no formato HH:mm-HH:mm", () => {
    render(<AbaConfiguracoesGerais textos={TEXTOS} editavel />);
    const sabado = TEXTOS.configuracoesGerais.expediente.dias.sab;

    fireEvent.change(screen.getByLabelText(`${sabado} · ${TEXTOS.configuracoesGerais.expediente.fim}`), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: TEXTOS.configuracoesGerais.salvar }));

    expect(estado.mutate).toHaveBeenCalledWith({ chave: "alerta.horario_cliente.sab", valor: "08:00-13:00" });
  });

  it("sem permissão de edição, tudo fica visível e travado", () => {
    render(<AbaConfiguracoesGerais textos={TEXTOS} editavel={false} />);

    expect(screen.getByText(TEXTOS.configuracoesGerais.somenteLeitura)).toBeInTheDocument();
    for (const interruptor of screen.getAllByRole("switch")) expect(interruptor).toHaveAttribute("data-disabled");
    expect(screen.getByLabelText(TEXTOS.configuracoesGerais.inativos.limite)).toBeDisabled();
  });

  it("chave ausente na instância não vira controle", () => {
    render(<AbaConfiguracoesGerais textos={TEXTOS} editavel />);

    expect(screen.queryByText(TEXTOS.configuracoesGerais.presenca.titulo)).not.toBeInTheDocument();
    expect(screen.queryByText(TEXTOS.configuracoesGerais.avaliacao.nps)).not.toBeInTheDocument();
  });
});
