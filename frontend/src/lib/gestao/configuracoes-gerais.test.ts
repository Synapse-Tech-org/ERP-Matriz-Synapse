import { describe, expect, it } from "vitest";

import { escreverDia, horarioValido, lerDia, pertenceAsConfiguracoesGerais } from "./configuracoes-gerais";

describe("configurações gerais", () => {
  it("lê o valor do dia nos três modos e cai no padrão quando ilegível", () => {
    expect(lerDia("padrao")).toEqual({ modo: "padrao", inicio: "", fim: "" });
    expect(lerDia("Fechado")).toEqual({ modo: "fechado", inicio: "", fim: "" });
    expect(lerDia("08:00-12:00")).toEqual({ modo: "proprio", inicio: "08:00", fim: "12:00" });
    expect(lerDia("8h às 12h")).toEqual({ modo: "padrao", inicio: "", fim: "" });
  });

  it("escreve o dia no formato que o backend entende", () => {
    expect(escreverDia({ modo: "padrao", inicio: "", fim: "" })).toBe("padrao");
    expect(escreverDia({ modo: "fechado", inicio: "08:00", fim: "12:00" })).toBe("fechado");
    expect(escreverDia({ modo: "proprio", inicio: "08:00", fim: "12:00" })).toBe("08:00-12:00");
  });

  it("aceita só faixas HH:mm com o fim depois do início", () => {
    expect(horarioValido("08:00", "18:30")).toBe(true);
    expect(horarioValido("18:30", "08:00")).toBe(false);
    expect(horarioValido("08:00", "08:00")).toBe(false);
    expect(horarioValido("8:00", "18:00")).toBe(false);
  });

  it("reconhece as chaves que saem de Automação › Parâmetros avançados", () => {
    expect(pertenceAsConfiguracoesGerais("atendimento.finalizar_fim_expediente.horario")).toBe(true);
    expect(pertenceAsConfiguracoesGerais("alerta.horario_cliente.sab")).toBe(true);
    expect(pertenceAsConfiguracoesGerais("avaliacao_atendimento.nps_pergunta")).toBe(true);
    expect(pertenceAsConfiguracoesGerais("ia.resumo.intervalo_horas")).toBe(false);
  });
});
