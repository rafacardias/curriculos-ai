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
import { readFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
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
    //
    // Lê o DIRETÓRIO, não uma lista literal: uma lista teria que ser lembrada a
    // cada migration nova, e a que fosse esquecida seria justamente a que ninguém
    // revisou. Cobertura por construção.
    const todas = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
    assert.ok(todas.length >= 3, "o diretório de migrations sumiu ou está vazio");
    for (const f of todas) {
      const body = sql(f)
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      assert.doesNotMatch(body, /\bDROP\s+(TABLE|COLUMN)\b/i, `${f} contém DROP`);
      assert.doesNotMatch(body, /\bRENAME\b/i, `${f} contém RENAME`);
    }
  });
});

describe("migration 003 — modalidade confirmada, aditiva sobre 001+002", () => {
  it("um banco já povoado migra e a coluna do adapter fica intacta", () => {
    const db = new DatabaseSync(join(tmp, "old3.db"));
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(sql("001_init.sql"));
    db.exec(sql("002_rescore_provenance.sql"));
    db.exec(`
      INSERT INTO companies (id, name, name_normalized, created_at, updated_at)
        VALUES ('c1', 'ACME', 'acme', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
      INSERT INTO jobs (id, fingerprint, source, url, title, company_id, company_name,
                        location, remote_type, seen_at, score, status)
        VALUES ('j1', 'fp1', 'linkedin', 'https://x/1', 'AI Engineer', 'c1', 'ACME',
                'São Paulo, SP', NULL, '2026-01-01T00:00:00Z', 61.0, 'queued'),
               ('j2', 'fp2', 'gupy', 'https://x/2', 'Analista', 'c1', 'ACME',
                'Recife, PE', 'hybrid', '2026-01-01T00:00:00Z', 47.0, 'queued');
    `);

    db.exec(sql("003_modality_confirmation.sql"));

    // 1. As colunas novas nascem NULL — pendente é o estado inicial de todo mundo,
    //    e nenhuma vaga é promovida a "verificada" pela migration.
    const j1 = db.prepare("SELECT * FROM jobs WHERE id = 'j1'").get() as Record<string, unknown>;
    assert.equal(j1.modality_confirmed, null);
    assert.equal(j1.modality_confirmed_at, null);
    assert.equal(j1.modality_note, null);

    // 2. `remote_type` não foi tocado — a proveniência do adapter sobrevive.
    assert.equal(j1.remote_type, null);
    const j2 = db.prepare("SELECT * FROM jobs WHERE id = 'j2'").get() as Record<string, unknown>;
    assert.equal(j2.remote_type, "hybrid");

    // 3. E a coluna da 002 continua lá: migrations empilham, não se substituem.
    assert.ok("score_previous" in j1);

    db.close();
  });
});
