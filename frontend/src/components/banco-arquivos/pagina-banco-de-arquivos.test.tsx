import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErroDeApi } from "@/lib/api/errors";
import { TIPOS_DE_ANEXO_ACEITOS_NO_ATENDIMENTO } from "@/lib/atendimento/arquivos-do-composer";
import type { ArquivoDoBanco, PastaDoBanco, ResultadoDoBanco } from "@/lib/banco-arquivos/api";
import { TextosSchema } from "@/lib/config/schema";
import { TextosProvider } from "@/lib/config/textos-provider";
import { definirCapacidadesDeTeste } from "@/test/capacidades-de-teste";

import { PaginaBancoDeArquivos } from "./pagina-banco-de-arquivos";

const api = vi.hoisted(() => ({
  listar: vi.fn(),
  obter: vi.fn(),
  adicionar: vi.fn(),
  listarPastas: vi.fn(),
  criarPasta: vi.fn(),
  renomearPasta: vi.fn(),
  mover: vi.fn(),
  flag: true,
  arquivoNaUrl: "",
}));

vi.mock("@/lib/banco-arquivos/api", async (importar) => ({
  ...await importar<typeof import("@/lib/banco-arquivos/api")>(),
  listarArquivosDoBanco: api.listar,
  obterArquivoDoBanco: api.obter,
  adicionarArquivoAoBanco: api.adicionar,
  listarPastasDoBanco: api.listarPastas,
  criarPastaDoBanco: api.criarPasta,
  renomearPastaDoBanco: api.renomearPasta,
  moverArquivoDoBanco: api.mover,
}));
vi.mock("@/lib/config/use-funcionalidades", () => ({
  useFuncionalidadesHabilitadas: () => ({ data: api.flag ? ["banco_arquivos"] : [] }),
}));
vi.mock("@/components/shell/cabecalho-lista-v2", () => ({ CabecalhoListaV2: () => null }));
vi.mock("./dialogo-enviar-arquivo-de-banco", () => ({ DialogoEnviarArquivoDeBanco: () => null }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/banco-arquivos",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(api.arquivoNaUrl),
}));

const textos = TextosSchema.parse(JSON.parse(readFileSync(
  resolve(process.cwd(), "../backend/crm-app/src/main/resources/textos.json"), "utf8",
)));
const arquivo: ArquivoDoBanco = {
  id: "6fc65db7-a8b9-4672-bc89-49cd02bd1db0",
  nome: "Catalogo.pdf", pasta: "catalogos", tipo: "PDF", mimeType: "application/pdf",
  tamanhoBytes: 50, descricao: "Versão atual", criadoEm: "2026-11-21T09:00:00Z",
};
const resposta: ResultadoDoBanco = {
  itens: [arquivo], total: 1, contagemPorPasta: { catalogos: 1 },
  usadoBytes: 50, limiteBytes: 5000, limiteArquivoBytes: 100, limiteDescricao: 1000,
};
const geral: PastaDoBanco = { id: "geral", nome: "Geral", geral: true };
const catalogos: PastaDoBanco = { id: "catalogos", nome: "Catálogos", geral: false };

function montar() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TextosProvider textos={textos}><PaginaBancoDeArquivos /></TextosProvider>
    </QueryClientProvider>,
  );
}

describe("Banco de Arquivos", () => {
  beforeEach(() => {
    api.flag = true;
    api.arquivoNaUrl = "";
    api.listar.mockReset().mockResolvedValue(resposta);
    api.adicionar.mockReset();
    api.obter.mockReset();
    api.listarPastas.mockReset().mockResolvedValue([geral, catalogos]);
    api.criarPasta.mockReset();
    api.renomearPasta.mockReset();
    api.mover.mockReset();
  });

  it("bloqueia a URL direta quando o módulo está desligado", () => {
    api.flag = false;
    montar();
    expect(screen.getByRole("status")).toHaveTextContent(textos.bancoArquivos.desativado);
    expect(api.listar).not.toHaveBeenCalled();
    expect(api.listarPastas).not.toHaveBeenCalled();
  });

  it("bloqueia inclusive a consulta pelo link direto quando a leitura é negada", () => {
    definirCapacidadesDeTeste({ negadas: ["banco_arquivos.ver"] });
    api.arquivoNaUrl = `arquivo=${arquivo.id}`;
    montar();
    expect(screen.getByRole("heading", { name: textos.gestao.acesso.semAcessoTitulo })).toBeInTheDocument();
    expect(api.listar).not.toHaveBeenCalled();
    expect(api.obter).not.toHaveBeenCalled();
    expect(api.listarPastas).not.toHaveBeenCalled();
  });

  it("mantém os arquivos acessíveis sem expor upload, edição, exclusão ou envio sem capacidade", async () => {
    definirCapacidadesDeTeste({
      negadas: ["banco_arquivos.criar", "banco_arquivos.editar", "banco_arquivos.excluir", "atendimentos.responder"],
    });
    montar();
    expect(await screen.findByRole("button", { name: arquivo.nome })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: textos.bancoArquivos.baixar })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: textos.bancoArquivos.enviarArquivos })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: textos.bancoArquivos.enviar })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: textos.bancoArquivos.maisAcoes }));
    expect(await screen.findByRole("menuitem", { name: textos.bancoArquivos.copiarLink })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: textos.bancoArquivos.editar })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: textos.bancoArquivos.excluir })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: textos.bancoArquivos.pastas.mover })).not.toBeInTheDocument();
  });

  it("usa o filtro no backend e alterna para a tabela com a mesma resposta", async () => {
    montar();
    await screen.findByRole("button", { name: arquivo.nome });
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(api.listar).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: "PDF", pagina: 0 }), expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: textos.bancoArquivos.lista }));
    expect(await screen.findByRole("table", { name: textos.bancoArquivos.titulo })).toBeInTheDocument();
  });

  it("mostra os novos tipos no filtro e envia o tipo de vídeo para a API", async () => {
    montar();
    await screen.findByRole("button", { name: arquivo.nome });
    fireEvent.click(screen.getByRole("button", { name: textos.bancoArquivos.maisTipos }));
    fireEvent.click(await screen.findByRole("menuitem", { name: textos.bancoArquivos.tipos.VIDEO }));
    await waitFor(() => expect(api.listar).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: "VIDEO", pagina: 0 }), expect.anything()));
  });

  it("usa toda a lista do chat no seletor e envia formatos novos mesmo com MIME ausente", async () => {
    api.adicionar.mockResolvedValue(arquivo);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: textos.bancoArquivos.enviarArquivos }));
    const modal = screen.getByRole("dialog");
    const input = modal.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept.split(",")).toEqual(expect.arrayContaining(TIPOS_DE_ANEXO_ACEITOS_NO_ATENDIMENTO.split(",")));
    const permitidos = ["manual.doc", "valores.xls", "medidas.ppt", "apresentacao.pptx", "aviso.txt", "foto.webp", "recado.opus", "obra.mp4", "detalhe.3gp", "projeto.dwg"]
      .map((nome) => new File(["conteudo"], nome));
    const bloqueado = new File(["conteudo"], "executavel.exe");
    fireEvent.change(input, { target: { files: [...permitidos, bloqueado] } });
    fireEvent.click(within(modal).getByRole("button", { name: textos.bancoArquivos.enviar }));
    await waitFor(() => expect(api.adicionar).toHaveBeenCalledTimes(permitidos.length));
    expect(api.adicionar.mock.calls.map(([file]) => file)).toEqual(permitidos);
    expect(await within(modal).findByText(textos.bancoArquivos.erroTipo)).toBeInTheDocument();
  });

  it("não reenvia itens concluídos nem dispara os itens restantes quando o servidor sinaliza rate limit", async () => {
    api.adicionar.mockResolvedValueOnce(arquivo).mockRejectedValueOnce(new ErroDeApi(429, null, ""));
    montar();
    fireEvent.click(await screen.findByRole("button", { name: textos.bancoArquivos.enviarArquivos }));
    const modal = screen.getByRole("dialog");
    const input = modal.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["ok"], "ok.pdf"), new File(["limite"], "limite.pdf"), new File(["restante"], "restante.pdf")] } });
    fireEvent.click(within(modal).getByRole("button", { name: textos.bancoArquivos.enviar }));
    expect(await within(modal).findByText(textos.bancoArquivos.erroLimite)).toBeInTheDocument();
    expect(api.adicionar).toHaveBeenCalledTimes(2);
    expect(within(modal).queryByText("ok.pdf")).not.toBeInTheDocument();
    expect(within(modal).getByText("restante.pdf")).toBeInTheDocument();
  });

  it("seleciona uma pasta real no filtro mas usa Geral por padrão em um novo upload", async () => {
    api.adicionar.mockResolvedValue({ ...arquivo, pasta: geral.id });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: textos.bancoArquivos.enviarArquivos }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: textos.bancoArquivos.cancelar }));

    fireEvent.click(screen.getByRole("button", { name: textos.bancoArquivos.todosArquivos }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Catálogos/ }));
    await waitFor(() => expect(api.listar).toHaveBeenLastCalledWith(expect.objectContaining({ pasta: catalogos.id }), expect.anything()));

    fireEvent.click(await screen.findByRole("button", { name: textos.bancoArquivos.enviarArquivos }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("combobox", { name: textos.bancoArquivos.pasta })).toHaveTextContent(geral.nome);
    const novo = new File(["ok"], "novo.pdf");
    fireEvent.change(modal.querySelector('input[type="file"]')!, { target: { files: [novo] } });
    fireEvent.click(within(modal).getByRole("button", { name: textos.bancoArquivos.enviar }));
    await waitFor(() => expect(api.adicionar).toHaveBeenCalledWith(novo, geral.id, ""));
  });

  it("permite criar e renomear pasta personalizada com o mesmo identificador", async () => {
    const criada = { id: "c830631e-45c0-43c0-940e-6474da5e5f9d", nome: "Executivos", geral: false };
    api.criarPasta.mockImplementation(async () => {
      api.listarPastas.mockResolvedValue([geral, catalogos, criada]);
      return criada;
    });
    api.renomearPasta.mockImplementation(async (_, nome) => {
      const renomeada = { ...criada, nome };
      api.listarPastas.mockResolvedValue([geral, catalogos, renomeada]);
      return renomeada;
    });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: textos.bancoArquivos.todosArquivos }));
    fireEvent.click(await screen.findByRole("menuitem", { name: textos.bancoArquivos.pastas.criar }));
    const criacao = screen.getByRole("dialog");
    fireEvent.change(within(criacao).getByRole("textbox", { name: textos.bancoArquivos.pastas.nome }), { target: { value: criada.nome } });
    fireEvent.click(within(criacao).getByRole("button", { name: textos.bancoArquivos.pastas.criar }));
    expect(api.criarPasta).toHaveBeenCalledWith(criada.nome);
    fireEvent.click(await screen.findByRole("button", { name: criada.nome }));
    fireEvent.click(await screen.findByRole("menuitem", { name: textos.bancoArquivos.pastas.renomear }));
    const edicao = screen.getByRole("dialog");
    fireEvent.change(within(edicao).getByRole("textbox", { name: textos.bancoArquivos.pastas.nome }), { target: { value: "Projetos executivos" } });
    fireEvent.click(within(edicao).getByRole("button", { name: textos.bancoArquivos.salvar }));
    expect(api.renomearPasta).toHaveBeenCalledWith(criada.id, "Projetos executivos");
    expect(await screen.findByRole("button", { name: "Projetos executivos" })).toBeInTheDocument();
  });

  it("mantém as pastas navegáveis sem expor gestão a quem não tem a capacidade", async () => {
    definirCapacidadesDeTeste({ negadas: ["banco_arquivos.gerenciar_pastas"] });
    montar();
    await screen.findByRole("button", { name: textos.bancoArquivos.enviarArquivos });
    fireEvent.click(screen.getByRole("button", { name: textos.bancoArquivos.todosArquivos }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Catálogos/ }));
    fireEvent.click(await screen.findByRole("button", { name: catalogos.nome }));
    expect(screen.queryByRole("menuitem", { name: textos.bancoArquivos.pastas.criar })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: textos.bancoArquivos.pastas.renomear })).not.toBeInTheDocument();
  });

  it("move pelo submenu Enviar para e mostra a pasta atual desabilitada", async () => {
    const manuais: PastaDoBanco = { id: "056f5802-8b86-4acf-a7cf-b0b984e72936", nome: "Manuais $&", geral: false };
    api.listarPastas.mockResolvedValue([geral, catalogos, manuais]);
    api.mover.mockResolvedValue({ ...arquivo, pasta: manuais.id });
    montar();
    await screen.findByRole("button", { name: textos.bancoArquivos.enviarArquivos });
    fireEvent.click(screen.getByRole("button", { name: textos.bancoArquivos.maisAcoes }));
    fireEvent.click(await screen.findByRole("menuitem", { name: textos.bancoArquivos.pastas.mover }));
    const destino = await screen.findByRole("menuitem", { name: manuais.nome });
    expect(screen.getByRole("menuitem", { name: geral.nome })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: catalogos.nome })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(destino);
    await waitFor(() => expect(api.mover).toHaveBeenCalledWith(arquivo.id, manuais.id));
    await screen.findByText(`Arquivo movido para ${manuais.nome}.`);
  });
});
