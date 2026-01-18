import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

function migrationsDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // backend/src/db -> backend/db/migrations
  return path.resolve(here, "../../db/migrations");
}

async function listSqlMigrations(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

function ensureMigrationsTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
}

function hasMigrationApplied(db: DatabaseSync, name: string): boolean {
  const stmt = db.prepare("SELECT 1 AS ok FROM schema_migrations WHERE name=? LIMIT 1;");
  const row = stmt.get(name) as undefined | { ok?: number };
  return !!row?.ok;
}

function markMigrationApplied(db: DatabaseSync, name: string, appliedAt: number) {
  const stmt = db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?);");
  stmt.run(name, appliedAt);
}

export async function migrateDb(db: DatabaseSync, opts?: { migrationsPath?: string; logger?: { info?: (msg: string) => void } }) {
  const dir = opts?.migrationsPath ?? migrationsDir();
  ensureMigrationsTable(db);

  const files = await listSqlMigrations(dir);
  for (const name of files) {
    if (hasMigrationApplied(db, name)) continue;
    const fullPath = path.join(dir, name);
    const sql = await fs.readFile(fullPath, "utf8");

    db.exec("BEGIN;");
    try {
      db.exec(sql);
      markMigrationApplied(db, name, Date.now());
      db.exec("COMMIT;");
      opts?.logger?.info?.(`[db] applied migration ${name}`);
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }
  }
}

