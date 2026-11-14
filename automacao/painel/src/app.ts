import {
  createElement,
  RefreshCw,
  LogOut,
  ChevronRight,
  ChevronLeft,
  X,
  Database,
  CheckCircle2,
  AlertCircle,
  Inbox,
} from "lucide";
import { api, ErroApi, type Usuario, type DetalheExecucao } from "./api";
import { t } from "./textos";
import "./estilos.css";

const root = document.querySelector<HTMLDivElement>("#app")!;
let geracao = 0;
let timer: number | undefined;
const selecionar = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
function icon(
  target: Element,
  definition: Parameters<typeof createElement>[0],
): void {
  target.replaceChildren(
    createElement(definition, { width: 18, height: 18, "stroke-width": 1.8 }),
  );
}
function text(id: string, value: string): void {
  const e = document.getElementById(id);
  if (e) e.textContent = value;
}
function celula(value: string): HTMLTableCellElement {
  const e = document.createElement("td");
  e.textContent = value;
  return e;
}
function botaoIcone(
  definition: Parameters<typeof createElement>[0],
  label: string,
  action: () => void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon-button";
  b.title = label;
  b.setAttribute("aria-label", label);
  icon(b, definition);
  b.addEventListener("click", action);
  return b;
}
function horario(value: string | null): string {
  if (!value) return "--";
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(d)
    : "--";
}
function duracao(inicio: string | null, fim: string | null): string {
  if (!inicio || !fim) return "--";
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  return Number.isFinite(ms) && ms >= 0
    ? ms < 1000
      ? ms + " ms"
      : (ms / 1000).toFixed(1) + " s"
    : "--";
}
function badge(status: string): HTMLElement {
  const span = document.createElement("span");
  span.className =
    "badge " +
    (["success", "error", "crashed", "running", "waiting"].includes(status)
      ? status
      : "neutral");
  span.textContent = t.status[status] || status;
  return span;
}
function parar(): void {
  if (timer) window.clearInterval(timer);
  timer = undefined;
  geracao++;
  document.querySelector(".overlay")?.remove();
}

function login(mensagem = ""): void {
  parar();
  document.title = "Synapse | " + t.produto;
  root.innerHTML =
    '<main class="login"><div class="login-brand"><img src="/painel/synapse-logo.svg" alt="Synapse"><span id="product"></span></div><section class="login-form"><span class="eyebrow" id="access"></span><h1 id="login-title"></h1><form id="login"><label for="email" id="email-label"></label><input id="email" name="email" type="email" autocomplete="username" required maxlength="254"><label for="senha" id="senha-label"></label><input id="senha" name="senha" type="password" autocomplete="current-password" required maxlength="1024"><p id="login-error" class="error-text" role="alert"></p><button class="primary" id="submit" type="submit"></button></form></section></main>';
  text("product", t.produto);
  text("access", t.acesso);
  text("login-title", t.entrar);
  text("email-label", t.email);
  text("senha-label", t.senha);
  text("submit", t.entrar);
  text("login-error", mensagem);
  selecionar<HTMLFormElement>("login").addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      const submit = selecionar<HTMLButtonElement>("submit");
      submit.disabled = true;
      submit.textContent = t.conectando;
      text("login-error", "");
      try {
        const result = await api.entrar(
          selecionar<HTMLInputElement>("email").value,
          selecionar<HTMLInputElement>("senha").value,
        );
        selecionar<HTMLInputElement>("senha").value = "";
        painel(result.usuario);
      } catch (error) {
        text(
          "login-error",
          error instanceof ErroApi ? t.erros[error.codigo] || t.falha : t.falha,
        );
        submit.disabled = false;
        submit.textContent = t.entrar;
      }
    },
  );
}

function painel(usuario: Usuario): void {
  parar();
  const versao = geracao;
  let pagina = 0;
  let total = 0;
  let ocupado = false;
  root.innerHTML =
    '<header class="topbar"><div class="brand"><img src="/painel/synapse-logo.svg" alt="Synapse"><span id="product"></span></div><div class="account"><span id="user"></span><span id="logout"></span></div></header><main class="workspace"><div class="page-heading"><div><div class="eyebrow" id="mode"></div><h1 id="heading"></h1></div><div class="connection" id="connection"><span id="db-icon"></span><span id="db-state"></span></div></div><section class="metrics" aria-label="Resumo"><div><span id="label-total"></span><strong id="total">--</strong></div><div><span id="label-success"></span><strong id="success">--</strong></div><div><span id="label-error"></span><strong id="errors">--</strong></div><div><span id="label-running"></span><strong id="running">--</strong></div></section><div class="toolbar"><label class="filter"><span id="status-label"></span><select id="status"></select></label><div class="toolbar-right"><label class="auto"><input id="automatic" type="checkbox"><span id="auto-label"></span></label><span id="refresh"></span></div></div><div id="notice" role="status"></div><div class="table-wrap"><table><thead><tr><th id="col-id"></th><th id="col-flow"></th><th id="col-status"></th><th id="col-start"></th><th id="col-duration"></th><th><span class="sr-only" id="col-details"></span></th></tr></thead><tbody id="rows"></tbody></table><div class="empty" id="empty"><span id="empty-icon"></span><p id="empty-message"></p></div></div><footer class="pagination"><span id="page-summary"></span><div><span id="prev"></span><span id="page-number"></span><span id="next"></span></div></footer><div class="runtime"><span id="automation"></span><span id="executor"></span></div></main>';
  for (const [id, label] of Object.entries({
    product: t.produto,
    user: usuario.nome,
    mode: t.consulta,
    heading: t.execucoes,
    "label-total": t.total,
    "label-success": t.sucesso,
    "label-error": t.falhas,
    "label-running": t.emExecucao,
    "status-label": t.situacao,
    "auto-label": t.automatico,
    "col-id": t.id,
    "col-flow": t.fluxo,
    "col-status": t.situacao,
    "col-start": t.inicio,
    "col-duration": t.duracao,
    "col-details": t.detalhes,
  }))
    text(id, label);
  icon(selecionar("db-icon"), Database);
  icon(selecionar("empty-icon"), Inbox);
  selecionar("logout").append(
    botaoIcone(LogOut, t.sair, () => {
      void api.sair().finally(() => login());
    }),
  );
  const refresh = botaoIcone(RefreshCw, t.atualizar, () => {
    void carregar();
  });
  selecionar("refresh").append(refresh);
  const prev = botaoIcone(ChevronLeft, t.anterior, () => {
    if (pagina > 0) {
      pagina--;
      void carregar();
    }
  });
  selecionar("prev").append(prev);
  const next = botaoIcone(ChevronRight, t.proxima, () => {
    if ((pagina + 1) * 20 < total) {
      pagina++;
      void carregar();
    }
  });
  selecionar("next").append(next);
  const status = selecionar<HTMLSelectElement>("status");
  for (const value of [
    "",
    "success",
    "error",
    "running",
    "waiting",
    "canceled",
    "crashed",
  ]) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = value ? t.status[value] : t.todas;
    status.append(o);
  }
  status.addEventListener("change", () => {
    pagina = 0;
    void carregar();
  });
  selecionar<HTMLInputElement>("automatic").addEventListener(
    "change",
    (event) => {
      if (timer) window.clearInterval(timer);
      timer = undefined;
      if ((event.target as HTMLInputElement).checked)
        timer = window.setInterval(() => {
          if (!document.hidden) void carregar();
        }, 10000);
    },
  );
  async function carregar(): Promise<void> {
    if (ocupado || versao !== geracao) return;
    ocupado = true;
    refresh.disabled = true;
    text("notice", "");
    try {
      const estado = await api.estado();
      if (versao !== geracao) return;
      text("db-state", t.estados[estado.estado] || estado.estado);
      selecionar("connection").classList.toggle(
        "connected",
        estado.estado === "PRONTO",
      );
      text("automation", estado.automacaoHabilitada ? t.ativa : t.desativada);
      text("executor", estado.executorDisponivel ? "" : t.executorPendente);
      for (const [id, key] of [
        ["total", "total"],
        ["success", "sucesso"],
        ["errors", "falhas"],
        ["running", "emExecucao"],
      ] as const)
        text(
          id,
          estado.resumo
            ? new Intl.NumberFormat("pt-BR").format(estado.resumo[key])
            : "--",
        );
      selecionar("rows").replaceChildren();
      if (estado.estado !== "PRONTO") {
        text("empty-message", t.estados[estado.estado] || t.falha);
        selecionar("empty").hidden = false;
        total = 0;
        return;
      }
      const data = await api.listar(pagina, status.value);
      if (versao !== geracao) return;
      total = data.total;
      selecionar("empty").hidden = data.itens.length > 0;
      text("empty-message", t.vazio);
      for (const row of data.itens) {
        const tr = document.createElement("tr");
        tr.append(
          celula(row.id),
          celula(row.fluxoNome || row.fluxoId || t.semNome),
        );
        const sc = celula("");
        sc.append(badge(row.status));
        tr.append(
          sc,
          celula(horario(row.iniciadoEm)),
          celula(duracao(row.iniciadoEm, row.finalizadoEm)),
        );
        const action = celula("");
        action.append(
          botaoIcone(ChevronRight, t.detalhes, () => {
            void detalhes(row.id);
          }),
        );
        tr.append(action);
        selecionar("rows").append(tr);
      }
    } catch (error) {
      if (versao === geracao) {
        text("notice", t.falha);
        selecionar("notice").className = "notice error-text";
        text("empty-message", t.falha);
        selecionar("empty").hidden = false;
      }
    } finally {
      ocupado = false;
      if (versao === geracao) {
        refresh.disabled = false;
        prev.disabled = pagina === 0;
        next.disabled = (pagina + 1) * 20 >= total;
        text(
          "page-summary",
          new Intl.NumberFormat("pt-BR").format(total) + " " + t.registros,
        );
        text(
          "page-number",
          t.pagina +
            " " +
            (pagina + 1) +
            " " +
            t.de +
            " " +
            Math.max(1, Math.ceil(total / 20)),
        );
      }
    }
  }
  void carregar();
}

async function detalhes(id: string): Promise<void> {
  const focoAnterior = document.activeElement;
  document.querySelector(".overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const drawer = document.createElement("section");
  drawer.className = "drawer";
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-label", t.execucao + " " + id);
  const close = () => {
    overlay.remove();
    if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected)
      focoAnterior.focus();
  };
  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.textContent = t.execucao + " " + id;
  header.append(title, botaoIcone(X, t.fechar, close));
  drawer.append(header);
  const body = document.createElement("div");
  body.className = "drawer-body";
  body.textContent = t.carregando;
  drawer.append(body);
  overlay.append(drawer);
  root.append(overlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "Tab") {
      event.preventDefault();
      header.querySelector("button")?.focus();
    }
  });
  header.querySelector("button")?.focus();
  try {
    const data = await api.detalhar(id);
    if (!overlay.isConnected) return;
    mostrarDetalhe(body, data);
  } catch {
    body.textContent = t.falha;
  }
}
function mostrarDetalhe(body: HTMLElement, data: DetalheExecucao): void {
  body.replaceChildren();
  const flow = document.createElement("h3");
  flow.textContent = data.fluxoNome || data.fluxoId || t.semNome;
  body.append(flow, badge(data.status));
  const meta = document.createElement("dl");
  for (const [label, value] of [
    [t.inicio, horario(data.iniciadoEm)],
    [t.fim, horario(data.finalizadoEm)],
    [t.duracao, duracao(data.iniciadoEm, data.finalizadoEm)],
  ]) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    meta.append(dt, dd);
  }
  body.append(meta);
  const heading = document.createElement("h3");
  heading.textContent = t.etapas;
  body.append(heading);
  if (!data.detalhesDisponiveis || !data.etapas.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = t.semDetalhes;
    body.append(p);
    return;
  }
  const list = document.createElement("ol");
  list.className = "steps";
  for (const etapa of data.etapas) {
    const li = document.createElement("li");
    const mark = document.createElement("span");
    mark.className = etapa.status === "erro" ? "step-error" : "step-success";
    icon(mark, etapa.status === "erro" ? AlertCircle : CheckCircle2);
    const name = document.createElement("span");
    name.textContent = etapa.nome;
    const duration = document.createElement("small");
    duration.textContent =
      Math.round(etapa.duracaoMs) +
      " ms" +
      (etapa.tentativas > 1
        ? " / " + etapa.tentativas + " " + t.tentativas
        : "");
    li.append(mark, name, duration);
    list.append(li);
  }
  body.append(list);
}
window.addEventListener("sessao-expirada", () => login());
api
  .sessao()
  .then((result) => painel(result.usuario))
  .catch(() => login());
