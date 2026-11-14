import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { prepararFrontendV2, cartoesFixture as cartoes, temaFixture as tema } from "./fixtures/frontend-v2";

function preparar(page: Page, habilitado: boolean, quantidade = 15, temaDaFixture = tema) {
  return prepararFrontendV2(page, { features: habilitado ? ["atendimentos_layout_v2"] : [], quantidade, tema: temaDaFixture });
}

async function verificarGeometria(page: Page) {
  const geometria = await page.evaluate(() => {
    const cabecalho = document.querySelector('[data-slot="cabecalho-conversa"]');
    const coluna = cabecalho?.parentElement?.getBoundingClientRect();
    return { excesso: document.documentElement.scrollWidth - innerWidth, larguraConversa: coluna?.width };
  });
  expect(geometria.excesso).toBeLessThanOrEqual(1);
  expect(geometria.larguraConversa).toBeGreaterThanOrEqual(320);
}

for (const largura of [1920, 1440, 1040, 720, 390]) {
  test(`v2: lista, conversa e composer utilizáveis em ${largura}px`, async ({ page }) => {
    const nativa = largura === 1920;
    await page.setViewportSize({ width: largura, height: nativa ? 1080 : largura === 390 ? 844 : 900 });
    const temaDoCenario = nativa
      ? JSON.parse(readFileSync(resolve("../docs/refatoracao-frontend/dashboard/tema-referencia.json"), "utf8"))
      : tema;
    const fixture = await preparar(page, true, 15, temaDoCenario);
    const erros: string[] = [];
    page.on("pageerror", (erro) => erros.push(erro.message));
    await page.goto("/atendimentos");
    await expect(page.locator('[data-slot="pagina-atendimentos"]')).toHaveAttribute("data-layout", "v2");
    await page.getByRole("button").filter({ hasText: cartoes[0].leadNome }).first().click();
    await expect(page.locator('[data-slot="cabecalho-conversa"]')).toBeVisible();
    await expect(page.locator('[data-slot="composer"] textarea')).toBeVisible();
    await page.waitForLoadState("networkidle");
    await verificarGeometria(page);
    if (nativa) {
      await expect(page.locator('[data-slot="lista-conversas"]')).toHaveCSS("width", "360px");
      await expect(page.locator('[data-slot="coluna-detalhes"]')).toHaveCSS("width", "340px");
      await expect(page.locator('[data-slot="cabecalho-conversa"]')).toHaveCSS("height", "74px");
      await expect(page.locator('[data-slot="mensagens-virtualizadas"]')).toHaveCSS("width", "760px");
      await page.keyboard.press("/");
      await expect(page.locator('[aria-keyshortcuts="/"]')).toBeFocused();
      await page.locator('[aria-keyshortcuts="/"]').blur();
    }
    await page.screenshot({
      path: `../docs/refatoracao-frontend/implementacao/atendimentos-v2-${largura}.png`,
      style: "nextjs-portal { display: none }",
    });
    if (nativa) {
      await page.getByRole("button", { name: "Notificações", exact: true }).click();
      await expect(page.getByText("Nenhuma notificação nesta sessão.")).toBeVisible();
    }
    if (largura === 390) {
      await page.setViewportSize({ width: 390, height: 520 });
      await verificarGeometria(page);
      const caixa = await page.locator('[data-slot="composer"] textarea').boundingBox();
      expect(caixa!.y + caixa!.height).toBeLessThanOrEqual(520);
    }
    expect(fixture.desconhecidas).toEqual([]);
    expect(erros.filter((erro) => !erro.includes("negative time stamp"))).toEqual([]);
  });
}

test("painel operacional exibe tons vivos, exporta a equipe e abre a fila e o chat", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const referencia = JSON.parse(readFileSync(resolve("../docs/refatoracao-frontend/dashboard/tema-referencia.json"), "utf8"));
  const agora = new Date();
  const depois = new Date(agora.getTime() + 3_600_000).toISOString();
  const fixture = await prepararFrontendV2(page, {
    features: ["atendimentos_layout_v2", "chat_interno"],
    tema: referencia,
    contatosChat: [{ id: "b2a77107-05f3-48c8-bc58-fbc2594841c9", nome: "Colega de verificação", presenca: "ONLINE" }],
    painelOperacional: {
      atualizadoEm: agora.toISOString(),
      finalizadosInicio: agora.toISOString(),
      finalizadosFim: depois,
      proximaTransicaoEm: depois,
      fuso: "America/Sao_Paulo",
      limiteMinutos: 20,
      equipe: [{
        atendenteId: cartoes[0].atendenteId,
        nome: cartoes[0].atendenteNome,
        fotoUrl: null,
        papel: "ATENDENTE",
        presenca: "ONLINE",
        entrada: false,
        elegivel: true,
        contagens: { novasMensagens: 2, novasConversas: 1, ativos: 4, pendentes: 1,
          semResposta: 0, finalizados: 0, emAberto: 5, potenciais: 0, esperaDesde: null },
      }],
    },
  });
  await page.goto("/atendimentos");
  const indicadores = page.locator('[data-slot="painel-operacional-indicadores"]');
  await expect(indicadores.getByRole("button")).toHaveCount(6);
  await expect(indicadores.locator('[data-indicador="ativos"]')).toHaveCSS("height", "154px");
  const tomNovas = await indicadores.locator('[data-indicador="novas"]').evaluate(
    (cartao) => getComputedStyle(cartao).getPropertyValue("--tom-indicador").trim(),
  );
  expect(tomNovas.toLowerCase()).toBe("#16a34a");
  await expect(page.locator('[data-slot="painel-operacional-contagem"]').first()).toHaveCSS("height", "30px");
  await expect.poll(() => indicadores.getByRole("button").evaluateAll(
    (botoes) => new Set(botoes.map((botao) => botao.getBoundingClientRect().top)).size,
  )).toBe(1);
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "../docs/refatoracao-frontend/implementacao/atendimentos-v2-painel-1920.png",
    style: "nextjs-portal { display: none }",
  });
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const arquivo = await csv;
  expect(arquivo.suggestedFilename()).toBe("equipe-atendimentos.csv");
  expect(readFileSync(await arquivo.path(), "utf8")).toContain('"Pessoa de teste";"Online";2;4;1;0;0;5');
  await indicadores.locator('[data-indicador="ativos"]').click();
  await expect.poll(() => fixture.requisicoes.some((rota) => rota.includes("/painel-operacional/fila?") && rota.includes("recorte=ATIVOS"))).toBe(true);
  const trilho = page.locator('[data-slot="trilho-equipe"]');
  await expect(trilho).toHaveCSS("width", "62px");
  await trilho.getByRole("button", { name: "Colega de verificação, Online" }).click();
  await expect.poll(() => fixture.chamadas.includes("/chat-interno/conversas/b2a77107-05f3-48c8-bc58-fbc2594841c9/mensagens")).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trilho).toHaveCount(0);
  expect(fixture.desconhecidas).toEqual([]);
});

test("sem flag mantém legado; mais linhas não acrescentam consultas por contato", async ({ browser }) => {
  const resultados: string[][] = [];
  for (const [habilitado, quantidade] of [[false, 1], [true, 15]] as const) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const fixture = await preparar(page, habilitado, quantidade);
    await page.goto("/atendimentos");
    await expect(page.locator('[data-slot="pagina-atendimentos"]')).toHaveAttribute("data-layout", habilitado ? "v2" : "legado");
    await expect(page.locator('[data-slot="cartao-conversa"]')).toHaveCount(quantidade);
    await page.waitForLoadState("networkidle");
    resultados.push([...fixture.chamadas].sort());
    if (!habilitado) await page.screenshot({ path: "../docs/refatoracao-frontend/implementacao/atendimentos-legado-1440.png" });
    expect(fixture.desconhecidas).toEqual([]);
    await page.close();
  }
  expect([...new Set(resultados[1])]).toEqual([...new Set(resultados[0])]);
  // A hidratação de /me em Next dev pode repetir uma leitura durante a troca do cache
  // de sessão. A listagem deve conservar exatamente as mesmas chamadas, sem N+1.
  expect(resultados[1].filter((caminho) => caminho.startsWith("/atendimentos")))
    .toEqual(resultados[0].filter((caminho) => caminho.startsWith("/atendimentos")));
});

test("v2 acompanha uma configuração escura da instância sem clarear os painéis", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Paleta sintética apenas da fixture: nenhuma alteração no tema ou no catálogo de produção.
  await preparar(page, true, 15, {
    ...tema, fundoApp: "#121212", fundoSuperficie: "#202020", fundoSutil: "#292929",
    textoForte: "#FAFAFA", textoPadrao: "#FAFAFA", textoSuave: "#B5B5B5",
    borda: "#4A4A4A", corPrimariaSuave: "#25364A",
    corPrimaria: "#60A5FA", corPrimariaHover: "#93C5FD", corPrimariaTexto: "#0F172A",
  });
  await page.goto("/atendimentos");
  await expect(page.locator('[data-slot="pagina-atendimentos"]')).toHaveAttribute("data-layout", "v2");
  await page.getByRole("button").filter({ hasText: cartoes[0].leadNome }).first().click();
  await expect(page.locator('[data-slot="composer"] textarea')).toBeVisible();
  await expect(page.locator('[data-slot="lista-conversas"]')).toHaveCSS("background-color", "rgb(32, 32, 32)");
  const cores = await page.locator('[data-slot="lista-conversas"]').evaluate((lista) => {
    const estilo = getComputedStyle(lista);
    return { fundo: estilo.backgroundColor, esperado: getComputedStyle(document.documentElement).getPropertyValue("--card").trim() };
  });
  expect(cores.fundo).not.toBe("rgb(255, 255, 255)");
  expect(cores.esperado).not.toBe("");
  await verificarGeometria(page);
  await page.screenshot({ path: "../docs/refatoracao-frontend/implementacao/atendimentos-v2-escuro-1440.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-slot="cabecalho-conversa"]')).toBeVisible();
  await verificarGeometria(page);
  await page.screenshot({ path: "../docs/refatoracao-frontend/implementacao/atendimentos-v2-escuro-390.png" });
});

for (const variante of ["a-sidebar-vinho", "b-sidebar-branca"]) {
  test(`v2 preserva o tema Disbrel ${variante}`, async ({ page }) => {
    const temaDaInstancia = JSON.parse(readFileSync(resolve(`../docker/provisionamento/instancias/disbrel/tema-${variante}.json`), "utf8"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparar(page, true, 15, temaDaInstancia);
    await page.goto("/atendimentos");
    await expect(page.locator('[data-slot="pagina-atendimentos"]')).toHaveAttribute("data-layout", "v2");
    await page.getByRole("button").filter({ hasText: cartoes[0].leadNome }).first().click();
    await expect(page.locator('[data-slot="composer"] textarea')).toBeVisible();
    await verificarGeometria(page);
    const primaria = await page.locator('[data-slot="pagina-atendimentos"]').evaluate((grade) => getComputedStyle(grade).getPropertyValue("--primary").trim());
    expect(primaria.toLowerCase()).toBe(temaDaInstancia.corPrimaria.toLowerCase());
    await page.screenshot({ path: `../docs/refatoracao-frontend/implementacao/atendimentos-v2-disbrel-${variante}.png` });
  });
}
