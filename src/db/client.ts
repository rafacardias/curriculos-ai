import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Raiz dos DADOS do sistema: db/, config/, profile/ e output/ penduram daqui.
 * Sobrescrevível por CURRICULOS_ROOT para que a suíte de testes rode numa
 * sandbox descartável sem nunca encostar no banco e no perfil reais.
 * Em produção a variável nunca é setada — o comportamento é idêntico ao anterior.
 */
export const PROJECT_ROOT = process.env.CURRICULOS_ROOT
  ? resolve(process.env.CURRICULOS_ROOT)
  : REPO_ROOT;

export const DB_PATH = join(PROJECT_ROOT, "db", "curriculos.db");

/** Migrations vêm SEMPRE do repositório — nunca de uma cópia de sandbox. */
export const MIGRATIONS_DIR = join(REPO_ROOT, "db", "migrations");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  return db;
}

function runMigrations(db: DatabaseSync): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`
  );
  if (!existsSync(MIGRATIONS_DIR)) return;
  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as Array<{ name: string }>).map((r) => r.name)
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString()
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    console.log(`migration aplicada: ${file}`);
  }
}

/** Executa fn dentro de uma transação (BEGIN/COMMIT/ROLLBACK). */
export function transaction<T>(fn: () => T): T {
  const d = getDb();
  d.exec("BEGIN");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
