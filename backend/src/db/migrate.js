import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "./pool.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(currentDir, "migrations");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function shouldRunWithoutTransaction(sql) {
  return sql.includes("-- codex:no-transaction");
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(Boolean)
    .filter(statement => statement !== "-- codex:no-transaction")
    .map(statement => `${statement};`);
}

async function run() {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const files = (await readdir(migrationsDir))
      .filter(filename => filename.endsWith(".sql"))
      .sort((left, right) => left.localeCompare(right));

    for (const filename of files) {
      const alreadyApplied = await client.query(
        `SELECT 1 FROM schema_migrations WHERE filename = $1`,
        [filename],
      );

      if (alreadyApplied.rowCount > 0) {
        continue;
      }

      const sql = await readFile(join(migrationsDir, filename), "utf8");
      const runWithoutTransaction = shouldRunWithoutTransaction(sql);

      if (runWithoutTransaction) {
        for (const statement of splitSqlStatements(sql)) {
          await client.query(statement);
        }
        await client.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1)`,
          [filename],
        );
      } else {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1)`,
          [filename],
        );
        await client.query("COMMIT");
      }

      console.log(`Applied migration ${filename}`);
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Migration failed", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
