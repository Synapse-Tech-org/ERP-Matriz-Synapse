import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Pool } from "pg";

export async function aplicarMigracoes(
  pool: Pool,
  pasta = fileURLToPath(new URL("../../../banco/migrations/", import.meta.url)),
): Promise<void> {
  // Em src o caminho relativo difere do JavaScript compilado em dist/src.
  let arquivos: string[];
  try {
    arquivos = await readdir(pasta);
  } catch {
    pasta = fileURLToPath(new URL("../../banco/migrations/", import.meta.url));
    arquivos = await readdir(pasta);
  }
  const versoes = arquivos
    .filter((n) => /^V\d+__[a-z0-9_]+\.sql$/.test(n))
    .sort(
      (a, b) => Number(a.match(/^V(\d+)/)![1]) - Number(b.match(/^V(\d+)/)![1]),
    );
  if (
    new Set(versoes.map((n) => Number(n.match(/^V(\d+)/)![1]))).size !==
    versoes.length
  )
    throw new Error("VERSAO_MIGRATION_DUPLICADA");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('synapse:automacao:migrations',0))",
    );
    await client.query(
      "CREATE TABLE IF NOT EXISTS automacao_infra.migracao (versao integer PRIMARY KEY, arquivo text NOT NULL, checksum text NOT NULL, aplicado_em timestamptz NOT NULL DEFAULT now())",
    );
    for (const arquivo of versoes) {
      const versao = Number(arquivo.match(/^V(\d+)/)![1]);
      const sql = await readFile(join(pasta, arquivo), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const aplicada = await client.query<{ checksum: string }>(
        "SELECT checksum FROM automacao_infra.migracao WHERE versao=$1",
        [versao],
      );
      const existente = aplicada.rows[0];
      if (existente) {
        if (existente.checksum !== checksum)
          throw new Error("MIGRATION_APLICADA_FOI_ALTERADA");
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO automacao_infra.migracao (versao,arquivo,checksum) VALUES ($1,$2,$3)",
        [versao, arquivo, checksum],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
