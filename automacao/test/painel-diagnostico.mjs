// Verificacao visual local: usa apenas fixtures, sem login/CRM/WhatsApp reais.
// Requer o build da automacao e o Playwright ja instalado no frontend do monorepo.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { chromium } = createRequire(new URL("../../frontend/package.json", import.meta.url))("playwright");
const raiz = fileURLToPath(new URL("../painel-dist/", import.meta.url));
const id = "fu_00000000-0000-4000-8000-000000000001";
const resumo = {
  id, fluxoId: "followup-typescript", fluxoNome: "Follow-up TypeScript",
  status: "error", iniciadoEm: "2026-11-17T11:07:00Z",
  finalizadoEm: "2026-11-17T11:07:12Z", modo: "schedule",
};
const detalhe = {
  ...resumo, detalhesDisponiveis: true, totalAtendimentos: 1,
  etapas: [{ nome: "ENVIADO_REGISTRO_CRM_PENDENTE (1)", status: "erro", duracaoMs: 120, tentativas: 1 }],
  atendimentos: [{
    atendimentoId: "00000000-0000-4000-8000-000000000002",
    resultado: "ENVIADO_REGISTRO_CRM_PENDENTE", duracaoMs: 120,
    comprovanteId: "1", statusEnvio: "ENVIADO", provedorId: "wamid.fixture",
    crmMensagemId: null, motivo: "REGISTRO_CRM_PENDENTE_HTTP_400",
    enviadoEm: "2026-11-17T11:07:01Z",
  }],
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    assert.equal(req.method, "GET");
    if (path.startsWith("/painel/api/")) {
      const dados = path.endsWith("/sessao") ? { usuario: { nome: "Operador de teste", papel: "GESTOR" } }
        : path.endsWith("/status") ? { estado: "PRONTO", automacaoHabilitada: true,
          followUpHabilitado: false, executorDisponivel: false,
          resumo: { total: 1, sucesso: 0, falhas: 1, emExecucao: 0 } }
        : path.endsWith("/execucoes") ? { itens: [resumo], pagina: 0, tamanho: 20, total: 1 }
        : path.endsWith("/" + id) ? detalhe : null;
      res.writeHead(dados ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(dados));
      return;
    }
    const arquivo = resolve(raiz, path === "/painel/" ? "index.html" : path.replace(/^\/painel\//, ""));
    if (!arquivo.startsWith(resolve(raiz) + sep)) throw new Error("CAMINHO_INVALIDO");
    const content = await readFile(arquivo);
    const tipos = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".html": "text/html" };
    res.writeHead(200, { "Content-Type": tipos[extname(arquivo)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
if (process.argv.includes("--preview")) {
  console.log(`PREVIA COM DADOS FICTICIOS: http://127.0.0.1:${server.address().port}/painel/`);
  // Somente fixtures GET locais: nao carrega envs nem chama CRM ou WhatsApp.
  await new Promise(() => {});
}
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  });
  const pasta = await mkdtemp(resolve(tmpdir(), "painel-diagnostico-"));
  for (const [nome, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const erros = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/painel/`);
    await page.getByRole("button", { name: "Ver detalhes", exact: true }).click();
    await page.getByText("wamid.fixture", { exact: true }).waitFor();
    assert.equal(await page.getByText("REGISTRO_CRM_PENDENTE_HTTP_400", { exact: true }).count(), 1);
    assert.ok((await page.locator(".diagnostico-atendimento").innerText()).includes("nao reenviar"));
    const dimensoes = await page.locator(".drawer-body").evaluate((el) => ({ largura: el.clientWidth, conteudo: el.scrollWidth }));
    assert.ok(dimensoes.conteudo <= dimensoes.largura + 1, JSON.stringify(dimensoes));
    assert.deepEqual(erros, []);
    const screenshot = resolve(pasta, nome + ".png");
    await page.screenshot({ path: screenshot });
    console.log(nome, "OK", screenshot);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
