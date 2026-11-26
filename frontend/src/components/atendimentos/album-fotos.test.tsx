import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { textosReais } from "@/test/textos-reais";
import type { MensagemResposta } from "@/lib/atendimento/types";
import { TextosProvider } from "@/lib/config/textos-provider";
import { emitirUrlAssinadaDaMidia } from "@/lib/lead/api";
import { AlbumFotos } from "./album-fotos";

vi.mock("@/lib/lead/api", () => ({ emitirUrlAssinadaDaMidia: vi.fn() }));

const fotos = Array.from({ length: 5 }, (_, i): MensagemResposta => ({
  id: `id-${i}`, remetenteTipo: "LEAD", remetenteId: "lead", remetenteNome: null,
  tipo: "IMAGEM", conteudo: null, midiaUrl: `https://storage.test/${i}.png`,
  midiaMetadados: JSON.stringify({ nome: `foto-${i + 1}.png` }), opcoes: null,
  statusEntrega: "ENTREGUE", erroEntrega: null, enviadoEm: "2026-11-26T12:00:00Z",
}));

function tela(lista: MensagemResposta[]) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <TextosProvider textos={textosReais}>
        <AlbumFotos fotos={lista} leadId="lead" nomeDoRemetente={null}
          renderizarDetalhes={(foto) => <span>{foto.id}</span>} />
      </TextosProvider>
    </QueryClientProvider>,
  );
}

it("exibe quatro miniaturas e busca apenas a foto aberta pelo seu ID", async () => {
  vi.mocked(emitirUrlAssinadaDaMidia).mockResolvedValue({ url: "https://storage.test/assinada.png" });
  tela(fotos.slice(0, 4));
  const album = screen.getByRole("group", { name: "Álbum com 4 fotos" });
  expect(within(album).getAllByRole("button")).toHaveLength(4);
  expect(album.querySelectorAll("img")).toHaveLength(4);
  expect(emitirUrlAssinadaDaMidia).not.toHaveBeenCalled();
  fireEvent.click(within(album).getByRole("button", { name: "Abrir foto 2 de 4" }));
  expect(await screen.findByRole("img", { name: "foto-2.png" })).toHaveAttribute("src", "https://storage.test/assinada.png");
  expect(emitirUrlAssinadaDaMidia).toHaveBeenCalledWith("lead", "id-1");
});

it("mostra +2, mantém a posição indisponível e navega para a quinta foto por teclado", async () => {
  vi.mocked(emitirUrlAssinadaDaMidia).mockClear();
  tela(fotos.map((foto, i) => i === 3 ? { ...foto, midiaUrl: null } : foto));
  const mais = screen.getByRole("button", { name: "Ver mais 2 fotos" });
  expect(mais).toHaveTextContent("+2");
  fireEvent.click(mais);
  const dialogo = screen.getByRole("dialog");
  expect(within(dialogo).getByText("id-3")).toBeInTheDocument();
  expect(within(dialogo).getByRole("button", { name: "Baixar" })).toBeDisabled();
  expect(emitirUrlAssinadaDaMidia).not.toHaveBeenCalled();
  fireEvent.keyDown(dialogo, { key: "ArrowRight" });
  expect(await screen.findByRole("img", { name: "foto-5.png" })).toBeInTheDocument();
  expect(emitirUrlAssinadaDaMidia).toHaveBeenCalledWith("lead", "id-4");
});

it("abre prévias locais sem assinatura nem download de servidor", () => {
  vi.mocked(emitirUrlAssinadaDaMidia).mockClear();
  tela(fotos.slice(0, 4).map((foto) => ({
    ...foto, id: `temp-${foto.id}`, remetenteTipo: "ATENDENTE",
    midiaUrl: `blob:http://localhost/${foto.id}`, ordemLocalDoLoteEm: foto.enviadoEm, statusEntrega: "PENDENTE",
  })));
  fireEvent.click(screen.getByRole("button", { name: "Abrir foto 1 de 4" }));
  expect(screen.getByRole("img", { name: "foto-1.png" })).toHaveAttribute("src", "blob:http://localhost/id-0");
  expect(screen.getByRole("button", { name: "Baixar" })).toBeDisabled();
  expect(emitirUrlAssinadaDaMidia).not.toHaveBeenCalled();
});
