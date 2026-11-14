import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cartoesFixture, prepararFrontendV2, temaFixture } from "./fixtures/frontend-v2";
import { dashboardFixture, dashboardVazioFixture } from "./fixtures/dashboard-v2";

const textos = JSON.parse(readFileSync(resolve("../backend/crm-app/src/main/resources/textos.json"), "utf8"));
const pasta = "../docs/refatoracao-frontend/dashboard";

async function geometria(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const main = page.locator('[data-slot="dashboard-corpo"]');
  await main.evaluate((elemento) => { elemento.scrollTop = elemento.scrollHeight; });
  await expect(page.getByText(textos.dashboard.secoes.horarioPico, { exact: true })).toBeVisible();
  const ultimo = await page.getByText(textos.dashboard.secoes.horarioPico, { exact: true }).boundingBox();
  expect(ultimo!.y).toBeLessThan(page.viewportSize()!.height);
  await main.evaluate((elemento) => { elemento.scrollTop = 0; });
}

for (const largura of [1920, 1440, 1024, 390]) {
  test(`Dashboard v2 em ${largura}px, filtros e gráficos sem nova consulta`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: largura === 1920 ? 1080 : largura === 390 ? 844 : 900 });
    const fixture = await prepararFrontendV2(page, { features: ["dashboard_layout_v2"], dashboard: dashboardFixture });
    const erros: string[] = [];
    page.on("pageerror", (erro) => erros.push(erro.message));
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-conteudo")).toHaveAttribute("data-layout", "v2");
    await expect(page.getByTestId(`kpi-${textos.dashboard.kpis.atendimentos}`)).toHaveText("84");
    await page.waitForLoadState("networkidle");
    await geometria(page);
    await page.screenshot({ path: `${pasta}/dashboard-v2-${largura}.png` });
    if (largura === 390) {
      const tabela = page.getByRole("table", { name: textos.dashboard.secoes.equipe, exact: true });
      const rolagem = tabela.locator("..");
      expect(await rolagem.evaluate((elemento) => elemento.scrollWidth > elemento.clientWidth)).toBe(true);
      await expect(page.getByRole("link", { name: "Ver equipe" })).toHaveCount(0);
      const filtros = page.getByRole("button", { name: textos.dashboard.filtros.rotulo, exact: true });
      await filtros.click();
      await expect(filtros).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#dashboard-filtros")).toBeVisible();
      await expect(page.getByLabel(textos.dashboard.filtros.ano, { exact: true })).toBeVisible();
      await page.screenshot({ path: `${pasta}/dashboard-v2-filtros-mobile.png` });
      await page.getByRole("button", { name: textos.dashboard.periodos.hoje, exact: true }).click();
      await expect.poll(() => fixture.requisicoes.filter((rota) => rota.startsWith("/api/v1/dashboard/visao-geral")).at(-1)).toContain("inicio=");
      await expect(page.getByTestId("dashboard-conteudo").getByRole("alert")).toHaveCount(0);
    }
    const antes = fixture.chamadas.filter((rota) => rota === "/dashboard/visao-geral").length;
    await page.getByRole("button", { name: textos.dashboard.modos.expandida, exact: true }).click();
    await expect(page.getByTestId("dashboard-conteudo")).toHaveAttribute("data-modo", "expandida");
    await page.waitForLoadState("networkidle");
    expect(fixture.chamadas.filter((rota) => rota === "/dashboard/visao-geral")).toHaveLength(antes);
    await page.getByRole("button", { name: textos.dashboard.meses[0], exact: true }).click();
    await expect.poll(() => fixture.chamadas.filter((rota) => rota === "/dashboard/visao-geral").length).toBeGreaterThan(antes);
    expect(fixture.desconhecidas).toEqual([]);
    expect(erros.filter((erro) => !erro.includes("negative time stamp"))).toEqual([]);
  });
}

test("Dashboard legado permanece sem flag e flag de Atendimentos não o habilita", async ({ page }) => {
  await prepararFrontendV2(page, { features: ["atendimentos_layout_v2"], dashboard: dashboardFixture });
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-conteudo")).toHaveAttribute("data-layout", "legado");
  await expect(page.getByTestId(`kpi-${textos.dashboard.kpis.atendimentos}`)).toHaveText("84");
  await expect(page.locator("[data-dashboard-kpi]")).toHaveCount(7);
  await expect(page.locator("[data-dashboard-kpi][data-indisponivel]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buscar contatos, equipe e painéis", exact: true })).toHaveCount(0);
});

test("busca por contato usa o filtro da Agenda e abre a ficha selecionada", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await prepararFrontendV2(page, { features: ["dashboard_layout_v2"], dashboard: dashboardFixture });
  const contato = cartoesFixture[0];
  const termo = "Contato de verificação";
  let consultas = 0;
  await page.route("**/api/v1/leads/filtrar", async (rota) => {
    consultas += 1;
    await rota.fulfill({ json: { leads: [{ id: contato.leadId, nome: contato.leadNome, empresa: null }], pagina: 0, temMais: false } });
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Buscar contatos, equipe e painéis", exact: true })).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialogo = page.getByRole("dialog", { name: "Buscar contatos, equipe e painéis" });
  const campo = dialogo.getByRole("searchbox", { name: "Buscar contatos, equipe e painéis" });
  await expect(campo).toBeFocused();
  await campo.fill(`  ${termo}  `);
  await page.waitForLoadState("networkidle");
  expect(consultas).toBe(0);

  const requisicao = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/v1/leads/filtrar");
  await campo.press("Enter");
  const consulta = await requisicao;
  expect(consulta.method()).toBe("POST");
  expect(new URL(consulta.url()).search).toBe("");
  expect(consulta.postDataJSON()).toEqual({
    pagina: 0, tamanho: 10,
    criterio: {
      tipo: "COMPOSTO", conector: "OU",
      criterios: ["nome", "telefone", "cpf"].map((campo) => ({ tipo: "SIMPLES", campo, operador: "CONTEM", valor: termo })),
    },
  });
  const resultado = dialogo.getByRole("button", { name: contato.leadNome, exact: true });
  await expect(resultado).toBeVisible();
  await page.screenshot({ path: `${pasta}/dashboard-v2-busca-1440.png` });
  await resultado.click();
  const ficha = page.getByRole("dialog", { name: textos.painelLead.titulo, exact: true });
  await expect(ficha.getByRole("textbox", { name: textos.painelLead.dados.nome })).toHaveValue(contato.leadNome);
  expect(fixture.chamadas).toContain(`/leads/${contato.leadId}/agenda`);
  await ficha.getByRole("button", { name: textos.painelLead.fechar, exact: true }).click();
  await expect(page.getByRole("button", { name: "Buscar contatos, equipe e painéis", exact: true })).toBeFocused();
  await page.keyboard.press("Control+k");
  const pessoa = dashboardFixture.equipeDesempenho[0];
  await campo.fill(pessoa.nome);
  await campo.press("Enter");
  const atalho = dialogo.getByRole("link", { name: pessoa.nome, exact: true });
  await expect(atalho).toHaveAttribute("href", `#dashboard-atendente-${pessoa.id}`);
  await atalho.click();
  await expect(page).toHaveURL(new RegExp(`#dashboard-atendente-${pessoa.id}$`));
  expect(fixture.desconhecidas).toEqual([]);
});

test("busca do Dashboard fica indisponível sem acesso a clientes", async ({ page }) => {
  await prepararFrontendV2(page, {
    features: ["dashboard_layout_v2"], dashboard: dashboardFixture, acessaClientes: false,
  });
  await page.goto("/dashboard");
  await expect(page.getByTestId(`kpi-${textos.dashboard.kpis.atendimentos}`)).toHaveText("84");
  await expect(page.getByRole("button", { name: "Buscar contatos, equipe e painéis", exact: true })).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Buscar contatos, equipe e painéis" })).toHaveCount(0);
});

test("Dashboard vazio não fabrica números, comparativos ou séries", async ({ page }) => {
  await prepararFrontendV2(page, { features: ["dashboard_layout_v2"], dashboard: dashboardVazioFixture });
  await page.goto("/dashboard");
  await expect(page.getByTestId(`kpi-${textos.dashboard.kpis.atendimentos}`)).toHaveText("0");
  await expect(page.getByTestId("selo-tendencia")).toHaveCount(0);
  await expect(page.getByTestId("serie-atendimentos")).toHaveCount(0);
  await expect(page.locator('[data-dashboard-kpi="nps"]')).toContainText("Métrica indisponível");
  await page.screenshot({ path: `${pasta}/dashboard-v2-vazio.png` });
});

test("Dashboard v2 com tema escuro da fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepararFrontendV2(page, {
    features: ["dashboard_layout_v2"], dashboard: dashboardFixture,
    tema: { ...temaFixture, fundoApp: "#121212", fundoSuperficie: "#202020", fundoSutil: "#292929",
      textoForte: "#FAFAFA", textoPadrao: "#FAFAFA", textoSuave: "#B5B5B5",
      borda: "#4A4A4A", corPrimaria: "#60A5FA", corPrimariaHover: "#93C5FD",
      corPrimariaTexto: "#0F172A", corPrimariaSuave: "#25364A" },
  });
  await page.goto("/dashboard");
  await expect(page.locator('[data-slot="dashboard-agora"]')).toHaveCSS("background-color", "rgb(32, 32, 32)");
  await page.screenshot({ path: `${pasta}/dashboard-v2-escuro-1440.png` });
});

test("Dashboard com a paleta da referência e geometria nativa 1920×1080", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const temaReferencia = JSON.parse(readFileSync(resolve("../docs/refatoracao-frontend/dashboard/tema-referencia.json"), "utf8"));
  const fixture = await prepararFrontendV2(page, {
    features: ["dashboard_layout_v2", "dashboard"],
    dashboard: {
      ...dashboardFixture,
      nps: { valor: 0, respostas: 2, comparativo: null },
      leadsParados: 3,
    },
    tema: temaReferencia,
    acessaEquipe: true,
  });
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-conteudo")).toHaveAttribute("data-layout", "v2");
  await expect(page.getByTestId(`kpi-${textos.dashboard.kpis.atendimentos}`)).toHaveText("84");
  await expect(page.locator('[data-slot="sidebar-slot"]')).toHaveCSS("width", "88px");
  await expect(page.locator('[data-slot="sidebar-logo"]')).toHaveCSS("width", "44px");
  await expect(page.locator('[data-slot="dashboard-busca"]')).toHaveCSS("width", "360px");
  await expect(page.locator('[data-slot="dashboard-selo-novo"]')).toHaveCount(3);
  await expect(page.getByTestId("serie-vendasFechadas").locator(".recharts-rectangle").first()).toHaveCSS("fill", "rgb(22, 163, 74)");
  await expect(page.getByRole("heading", { name: textos.dashboard.titulo, exact: true })).toHaveCSS("font-size", "30px");
  await expect(page.locator('[data-dashboard-kpi="atendimentos"]')).toHaveCSS("border-radius", "18px");
  await expect(page.locator("[data-dashboard-kpi]")).toHaveCount(11);
  const indisponiveis = page.locator("[data-dashboard-kpi][data-indisponivel]");
  await expect(indisponiveis).toHaveCount(2);
  await expect(indisponiveis.locator('[role="img"], button, a')).toHaveCount(0);
  await expect(page.getByTestId("kpi-NPS")).toHaveText("0");
  await expect(page.locator('[data-dashboard-kpi="leadsParados"] [data-slot="dashboard-kpi-valor"]')).toHaveText("3");
  const faixaAoVivo = page.locator('[data-slot="dashboard-agora-contagens"]');
  await expect(faixaAoVivo.locator(":scope > div")).toHaveCount(7);
  await expect(faixaAoVivo.locator("[data-indisponivel]")).toHaveCount(2);
  await expect(page.locator("#dashboard-ano")).toHaveCSS("height", "46px");
  await expect.poll(() => page.evaluate(() =>
    Array.from(document.fonts).some((fonte) =>
      fonte.family.includes("Remix Icon V2") && fonte.status === "loaded",
    ),
  )).toBe(true);
  await page.waitForLoadState("networkidle");
  await geometria(page);
  await page.screenshot({ path: `${pasta}/dashboard-v2-tema-referencia-1920.png`, style: "nextjs-portal { display: none }" });
  await page.getByRole("button", { name: "Notificações", exact: true }).click();
  await expect(page.getByText("Nenhuma notificação nesta sessão.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar lidas", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  const funil = page.getByRole("table", { name: textos.dashboard.secoes.funil, exact: true });
  await expect(funil.getByRole("columnheader", { name: "Parado" })).toBeVisible();
  const etapa = funil.getByRole("row").filter({ has: page.getByRole("rowheader", { name: dashboardFixture.funil[0].nome }) });
  await expect(etapa.getByRole("cell", { name: String(dashboardFixture.funil[0].quantidade), exact: true })).toHaveCount(1);
  await expect(etapa.getByRole("cell", { name: "Métrica indisponível" })).toHaveCount(1);
  const equipe = page.getByRole("table", { name: textos.dashboard.secoes.equipe, exact: true });
  await expect(equipe.getByRole("columnheader", { name: "1ª resposta" })).toBeVisible();
  await expect(equipe.getByRole("row").filter({ hasText: dashboardFixture.equipeDesempenho[0].nome })
    .getByRole("cell", { name: "Métrica indisponível" })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Ver equipe" })).toHaveAttribute("href", "/gestao");
  await page.locator('[data-slot="dashboard-analises"]').evaluate((elemento) => {
    elemento.scrollIntoView({ block: "start" });
  });
  await page.screenshot({ path: `${pasta}/dashboard-v2-tabelas-1920.png` });
  await page.locator('[data-slot="dashboard-corpo"]').evaluate((elemento) => { elemento.scrollTop = 0; });
  const ano = page.locator("#dashboard-ano");
  const outroAno = String(Number(await ano.locator('[data-slot="select-value"]').innerText()) - 1);
  await ano.click();
  await page.getByRole("option", { name: outroAno, exact: true }).click();
  await expect.poll(() => fixture.requisicoes.filter((rota) =>
    rota.startsWith("/api/v1/dashboard/visao-geral"),
  ).at(-1)).toContain(`ano=${outroAno}`);
  await page.getByRole("button", { name: textos.dashboard.filtros.originacao, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("grid")).toHaveCount(2);
});
