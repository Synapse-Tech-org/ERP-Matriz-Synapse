import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const shell = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/sh";
const fonte = readFileSync(new URL("../banco/aplicar-migracoes.sh", import.meta.url), "utf8");
function caminhoShell(caminho: string): string {
  return caminho.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, letra: string) => "/" + letra.toLowerCase());
}

// O psql e falso: captura o SQL gerado e nunca conecta a qualquer banco.
function executar(arquivos: Record<string, string>, falhar = false) {
  const pasta = mkdtempSync(join(tmpdir(), "migracoes-preparador-"));
  const base = caminhoShell(pasta);
  try {
    mkdirSync(join(pasta, "migrations"));
    mkdirSync(join(pasta, "bin"));
    for (const [nome, sql] of Object.entries(arquivos)) writeFileSync(join(pasta, "migrations", nome), sql);
    writeFileSync(join(pasta, "executor.sh"), fonte.replace("diretorio=/opt/automacao/migrations", `diretorio='${base}/migrations'`));
    writeFileSync(join(pasta, "bin", "psql"), `#!/bin/sh\nwhile [ "$#" -gt 0 ]; do\nif [ "$1" = --file ]; then cp "$2" '${base}/capturado.sql'; break; fi\nshift\ndone\nexit ${falhar ? 1 : 0}\n`, {mode:0o700});
    const resultado = spawnSync(shell, ["-c", `PATH='${base}/bin':/usr/bin:/bin exec sh '${base}/executor.sh'`], {
      encoding:"utf8", timeout:10000,
      env:{...process.env, AUTOMACAO_DB_USER:"fixture_app", AUTOMACAO_DB_PASSWORD:"fixture_password", AUTOMACAO_DB_NAME:"fixture"},
    });
    assert.ifError(resultado.error);
    return {...resultado, sql:existsSync(join(pasta,"capturado.sql")) ? readFileSync(join(pasta,"capturado.sql"),"utf8") : ""};
  } finally { rmSync(pasta, {recursive:true,force:true}); }
}

test("preparador gera transacao, lock, ordem numerica e checksum compativel com TypeScript", () => {
  const sql = "SELECT 1;\n";
  const r = executar({"V10__dez.sql":"SELECT 10;\n", "V2__dois.sql":sql});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.sql, /^BEGIN;/);
  assert.match(r.sql, /pg_advisory_xact_lock/);
  assert.match(r.sql, /automacao_infra\.provisionamento/);
  assert.match(r.sql, /MIGRATION_APLICADA_FOI_ALTERADA/);
  assert.ok(r.sql.indexOf("V2__dois.sql") < r.sql.indexOf("V10__dez.sql"));
  assert.ok(r.sql.includes(createHash("sha256").update(sql).digest("hex")));
  assert.match(r.sql, /COMMIT;\s*$/);
});

test("preparador falha se psql falhar e nao anuncia sucesso", () => {
  const r = executar({"V1__um.sql":"SELECT 1;\n"}, true);
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stderr, /Migracoes da automacao aplicadas e verificadas/);
});

test("preparador recusa arquivos ausentes, nomes invalidos e versoes duplicadas", () => {
  for (const arquivos of [{}, {"V1__UPPER.sql":"SELECT 1;"}, {"V1__um.sql":"SELECT 1;", "V01__duplicado.sql":"SELECT 1;"}]) {
    const r = executar(arquivos);
    assert.notEqual(r.status, 0);
    assert.equal(r.sql, "");
  }
});
