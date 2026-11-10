import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { parse } from "yaml";

// So renderiza configuracao: nao usa daemon, credenciais reais ou stack deploy.
const raiz = fileURLToPath(new URL("../../", import.meta.url));
const arquivo = "docker/dokploy-stack.yml";
const fonte = readFileSync(join(raiz, arquivo), "utf8");
const configTemporaria = mkdtempSync(join(tmpdir(), "synapse-stack-config-"));
after(() => rmdirSync(configTemporaria));
const docker = process.env.DOCKER_CLI || "docker";
const digest = "@sha256:" + "a".repeat(64);

function ambienteSintetico(adicional = {}) {
    const env = { ...process.env, DOCKER_CONFIG: configTemporaria };
    for (const [, nome, operador] of fonte.matchAll(
        /\$\{([A-Z0-9_]+)([^}]*)\}/g,
    )) {
        delete env[nome];
        if (operador.startsWith(":?")) env[nome] = "fixture-ci";
    }
    Object.assign(env, {
        SYNAPSE_IMAGE_TAG: "abcdef1",
        N8N_IMAGE_TAG: "2.33.4",
        SYNAPSE_TIMEZONE: "UTC",
        TRAEFIK_ROUTER_PREFIX: "ci-stack",
        SYNAPSE_DOMINIO: "crm.example.test",
        AUTOMACAO_DOMINIO: "n8n.example.test",
        MIDIA_DOMINIO: "midia.example.test",
        POSTGRES_DB: "crm_fixture",
        POSTGRES_USER: "admin_fixture",
        POSTGRES_PASSWORD: "dummy-postgres-ci",
        N8N_DB_NAME: "n8n_fixture",
        N8N_DB_USER: "n8n_fixture",
        N8N_DB_PASSWORD: "dummy-n8n-ci",
        ...adicional,
    });
    return env;
}

function renderizar(adicional = {}) {
    const resultado = spawnSync(
        docker,
        ["stack", "config", "--compose-file", arquivo],
        {
            cwd: raiz,
            env: ambienteSintetico(adicional),
            encoding: "utf8",
            timeout: 30000,
            maxBuffer: 4 * 1024 * 1024,
        },
    );
    assert.ifError(resultado.error);
    assert.equal(resultado.status, 0, resultado.stderr);
    const stack = parse(resultado.stdout);
    // O CLI legado pode retornar zero mesmo produzindo imagem com ${...} ou }.
    for (const [nome, servico] of Object.entries(stack.services)) {
        assert.doesNotMatch(
            servico.image,
            /[\s${}]/,
            "imagem invalida: " + nome,
        );
        const labels = servico.deploy?.labels || {};
        for (const valor of Object.values(labels)) {
            assert.doesNotMatch(
                String(valor),
                /\$\{|[{}]/,
                "label nao resolvida: " + nome,
            );
        }
    }
    return stack;
}

test("Stack nao contem variaveis aninhadas, regressao do deploy 63dee0a", () => {
    assert.doesNotMatch(fonte, /\$\{[^}]*\$\{/);
});

test("Docker Stack real: sem override mantem tag conjunta e componentes desligados", () => {
    const stack = renderizar();
    assert.equal(
        stack.services.automacao.image,
        "ghcr.io/synapse-auto/erp-matriz-synapse-automacao:abcdef1",
    );
    assert.equal(stack.services.automacao.deploy.replicas, 0);
    assert.equal(stack.services["automacao-banco"].deploy.replicas, 0);
    assert.equal(
        String(stack.services.automacao.deploy.labels["traefik.enable"]),
        "false",
    );
});

test("Docker Stack real: override vazio tambem preserva tag conjunta", () => {
    const stack = renderizar({
        AUTOMACAO_IMAGE_DIGEST: "",
        AUTOMACAO_ROUTER_PREFIX: "",
    });
    assert.equal(
        stack.services.automacao.image,
        "ghcr.io/synapse-auto/erp-matriz-synapse-automacao:abcdef1",
    );
});

test("Docker Stack real: digest seleciona somente automacao, sem mudar outros servicos", () => {
    const base = renderizar();
    const hml = renderizar({
        AUTOMACAO_IMAGE_DIGEST: digest,
        AUTOMACAO_REPLICAS: "1",
        AUTOMACAO_PROVISIONAR_REPLICAS: "1",
        AUTOMACAO_PAINEL_HABILITADO: "true",
        AUTOMACAO_PAINEL_DOMINIO: "painel.example.test",
        AUTOMACAO_ROUTER_PREFIX: "automacao-hml",
        AUTOMACAO_DB_NAME: "automacao_ci",
        AUTOMACAO_DB_USER: "automacao_ci_app",
        AUTOMACAO_DB_PASSWORD: "dummy-automacao-ci",
    });
    assert.equal(
        hml.services.automacao.image,
        base.services.automacao.image + digest,
    );
    for (const [nome, servico] of Object.entries(base.services)) {
        if (!["automacao", "automacao-banco"].includes(nome))
            assert.deepEqual(hml.services[nome], servico, nome);
    }
    assert.equal(hml.services.automacao.deploy.replicas, 1);
    const labels = hml.services.automacao.deploy.labels;
    assert.equal(String(labels["traefik.enable"]), "true");
    assert.equal(
        labels["traefik.http.routers.automacao-hml-ci-stack.rule"],
        "Host(`painel.example.test`) && (PathPrefix(`/painel/`) || Path(`/painel`) || Path(`/`))",
    );
    assert.equal(
        labels["traefik.http.routers.automacao-hml-ci-stack.service"],
        "automacao-hml-ci-stack",
    );
});

test("Docker Stack real: roteadores padrao sao exclusivos por filho", () => {
    const a = renderizar({ TRAEFIK_ROUTER_PREFIX: "filho-a" });
    const b = renderizar({ TRAEFIK_ROUTER_PREFIX: "filho-b" });
    assert.ok(
        a.services.automacao.deploy.labels[
            "traefik.http.routers.painel-filho-a.rule"
        ],
    );
    assert.ok(
        b.services.automacao.deploy.labels[
            "traefik.http.routers.painel-filho-b.rule"
        ],
    );
});
