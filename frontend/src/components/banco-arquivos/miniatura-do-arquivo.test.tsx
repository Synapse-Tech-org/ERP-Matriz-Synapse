import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { apiFetchBlob } from "@/lib/api/http-client";
import { obterMiniaturaDoBanco, type ArquivoDoBanco } from "@/lib/banco-arquivos/api";

import { MiniaturaDoArquivo, type TextosDoBanco } from "./apresentacao-do-arquivo";

vi.mock("@/lib/api/http-client", () => ({ apiFetchBlob: vi.fn() }));

const arquivo: ArquivoDoBanco = {
  id: "1", nome: "arquivo.pdf", pasta: "geral", tipo: "PDF", mimeType: "application/pdf",
  tamanhoBytes: 500, descricao: null, criadoEm: "2026-11-25T09:00:00Z",
};
const textos = { detalhes: "Detalhes do arquivo" } as TextosDoBanco;
const png = new Blob(["png"], { type: "image/png" });

afterEach(() => {
  vi.mocked(apiFetchBlob).mockReset();
  vi.unstubAllGlobals();
});

it("carrega a miniatura quando o card entra na área visível e libera a URL ao sair", async () => {
  let observar: IntersectionObserverCallback | undefined;
  class Observador {
    constructor(callback: IntersectionObserverCallback) { observar = callback; }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", Observador);
  const criarUrl = vi.fn(() => "blob:miniatura");
  const revogarUrl = vi.fn();
  class UrlDoTeste extends URL {
    static createObjectURL = criarUrl;
    static revokeObjectURL = revogarUrl;
  }
  vi.stubGlobal("URL", UrlDoTeste);
  vi.mocked(apiFetchBlob).mockResolvedValue(png);
  const abrir = vi.fn();
  const tela = render(
    <QueryClientProvider client={new QueryClient()}>
      <MiniaturaDoArquivo arquivo={arquivo} abrir={abrir} t={textos} />
    </QueryClientProvider>,
  );
  expect(apiFetchBlob).not.toHaveBeenCalled();
  act(() => observar?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
  const botao = screen.getByRole("button", { name: `${textos.detalhes} · ${arquivo.nome}` });
  await waitFor(() => expect(botao.querySelector("img")).toHaveAttribute("src", "blob:miniatura"));
  expect(apiFetchBlob).toHaveBeenCalledWith("/api/v1/banco-arquivos/1/miniatura", expect.any(AbortSignal));
  fireEvent.click(botao);
  expect(abrir).toHaveBeenCalledWith(arquivo);
  tela.unmount();
  expect(revogarUrl).toHaveBeenCalledWith("blob:miniatura");
});

it("descarta respostas vazias e tipos ativos mesmo quando a requisição tem sucesso", async () => {
  vi.mocked(apiFetchBlob).mockResolvedValueOnce(new Blob());
  vi.mocked(apiFetchBlob).mockResolvedValueOnce(new Blob(["<svg />"], { type: "image/svg+xml" }));
  expect(await obterMiniaturaDoBanco(arquivo.id)).toBeNull();
  expect(await obterMiniaturaDoBanco(arquivo.id)).toBeNull();
});

it("limita a 4 requisições e cancela cards que saíram antes de obter uma vaga", async () => {
  const pendentes: Array<(blob: Blob) => void> = [];
  vi.mocked(apiFetchBlob).mockImplementation(() => new Promise((resolver) => pendentes.push(resolver)));
  const lote = [1, 2, 3, 4].map((id) => obterMiniaturaDoBanco(String(id)));
  const cancelar = new AbortController();
  const saiu = obterMiniaturaDoBanco("5", cancelar.signal);
  const aindaNaTela = obterMiniaturaDoBanco("6");
  expect(apiFetchBlob).toHaveBeenCalledTimes(4);
  cancelar.abort();
  await expect(saiu).rejects.toMatchObject({ name: "AbortError" });
  pendentes[0](png);
  await lote[0];
  await waitFor(() => expect(apiFetchBlob).toHaveBeenLastCalledWith("/api/v1/banco-arquivos/6/miniatura", undefined));
  pendentes.slice(1).forEach((resolver) => resolver(png));
  await Promise.all([...lote, aindaNaTela]);
});
