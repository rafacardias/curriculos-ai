/**
 * Regra E4 — migration só ADITIVA, e um banco no schema ANTIGO tem que abrir,
 * migrar e continuar respondendo às queries existentes.
 *
 * O teste aplica 001 num banco temporário, POPULA com dados (é aí que
 * `ALTER TABLE ... ADD COLUMN` costuma esbarrar em CHECK/NOT NULL), aplica 002 e
 * só então verifica. Usa os arquivos .sql REAIS do repositório — se alguém editar
 * uma migration para algo destrutivo, isto quebra.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT } from "../helpers/sandbox.js";

const MIGRATIONS = join(REPO_ROOT, "db", "migrations");
const sql = (f: string) => readFileSync(join(MIGRATIONS, f), "utf-8");

const tmp = mkdtempSync(join(tmpdir(), "curriculos-mig-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

describe("migration 002 — aditiva sobre um banco no schema 001", () => {
  it("um banco 001 COM DADOS migra e as queries antigas seguem funcionando", () => {
    const db = new DatabaseSync(join(tmp, "old.db"));
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(sql("001_init.sql"));

    // Dados no schema antigo — inclusive uma vaga já pontuada e enfileirada.
    db.exec(`
      INSERT INTO companies (id, name, name_normalized, created_at, updated_at)
        VALUES ('c1', 'ACME', 'acme', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
      INSERT INTO jobs (id, fingerprint, source, url, title, company_id, company_name,
                        seen_at, score, score_detail, status)
        VALUES ('j1', 'fp1', 'gupy', 'https://x/1', 'QA Junior', 'c1', 'ACME',
                '2026-01-01T00:00:00Z', 55.5, '{"keyword_overlap":30}', 'queued');
    `);

    // A migration nova roda sem erro sobre a tabela populada.
    db.exec(sql("002_rescore_provenance.sql"));

    // 1. As colunas novas existem e nascem NULL na linha antiga.
    const row = db.prepare("SELECT * FROM jobs WHERE id = 'j1'").get() as Record<string, unknown>;
    assert.equal(row.score_previous, null);
    assert.equal(row.score_rescored_at, null);

    // 2. Nada do schema antigo se perdeu.
    assert.equal(row.score, 55.5);
    assert.equal(row.status, "queued");
    assert.equal(row.title, "QA Junior");

    // 3. As queries que o código já fazia continuam funcionando.
    const queued = db.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY score DESC LIMIT 20").all();
    assert.equal(queued.length, 1);

    // 4. O CHECK de status sobreviveu ao ALTER (SQLite reescreve a definição).
    assert.throws(() => db.exec("UPDATE jobs SET status = 'inventado' WHERE id = 'j1'"));

    db.close();
  });

  it("nenhuma migration contém comando destrutivo", () => {
    // E4 é uma regra, não uma intenção: aqui ela é mecânica.
    for (const f of ["001_init.sql", "002_rescore_provenance.sql"]) {
      const body = sql(f)
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      assert.doesNotMatch(body, /\bDROP\s+(TABLE|COLUMN)\b/i, `${f} contém DROP`);
      assert.doesNotMatch(body, /\bRENAME\b/i, `${f} contém RENAME`);
    }
  });
});
