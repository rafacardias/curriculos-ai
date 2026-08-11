/**
 * `answers add` busca a linha existente da tupla de dedup com `ORDER BY
 * updated_at DESC` (`src/cli/answers.ts:45`) — fix de determinismo, mesma
 * classe do BUG-010.
 *
 * Até 2026-08-11 este teste simulava duas linhas DUPLICADAS pré-existentes
 * inseridas direto no banco, porque a tabela não tinha `UNIQUE` na tupla de
 * dedup e esse estado era alcançável. `008_answer_bank_dedup.sql` fechou essa
 * lacuna com 4 índices únicos parciais (KNOWN-BUGS.md, `answers.ts:45`) — o
 * cenário que este teste simulava agora é IMPOSSÍVEL a nível de schema
 * (`INSERT` duplicado falha com `UNIQUE constraint failed`, não mais uma
 * segunda linha silenciosa). O `ORDER BY` continua correto e testado aqui,
 * só que pelo caminho real: duas chamadas de `answers add`, a segunda faz
 * `UPDATE` na mesma linha em vez de tentar duplicar.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb, runCli } from "../helpers/sandbox.js";
import { getDb } from "../../src/db/client.js";
import { normalize } from "../../src/core/dedup.js";

beforeEach(() => resetDb());

describe("answers add — segunda chamada na mesma tupla atualiza, nunca duplica", () => {
  it("chamar add duas vezes para a mesma pergunta/idioma/trilha/empresa faz UPDATE, não INSERT novo", () => {
    const db = getDb();
    const fp = normalize("Você tem CNH?");

    let result = runCli("src/cli/answers.ts", ["add", "Você tem CNH?", "resposta 1", "--lang", "pt"]);
    assert.equal(result.status, 0, result.stderr);
    result = runCli("src/cli/answers.ts", ["add", "Você tem CNH?", "resposta 2", "--lang", "pt"]);
    assert.equal(result.status, 0, result.stderr);

    const rows = db
      .prepare("SELECT id, answer FROM answer_bank WHERE question_fingerprint = ?")
      .all(fp) as Array<{ id: string; answer: string }>;
    assert.equal(rows.length, 1, "segunda chamada tem que atualizar a linha existente, não criar outra");
    assert.equal(rows[0]!.answer, "resposta 2");
  });

  it("duas linhas para a MESMA tupla não podem mais existir no banco — UNIQUE (008_answer_bank_dedup.sql) rejeita o INSERT direto", () => {
    const db = getDb();
    const fp = normalize("Precisa de veículo próprio?");
    db.prepare(
      `INSERT INTO answer_bank (id, question_fingerprint, question_text, answer, language, track_id, company_id, created_at, updated_at)
       VALUES ('a', ?, ?, 'resposta antiga 1', 'pt', NULL, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    ).run(fp, "Precisa de veículo próprio?");
    assert.throws(() => {
      db.prepare(
        `INSERT INTO answer_bank (id, question_fingerprint, question_text, answer, language, track_id, company_id, created_at, updated_at)
         VALUES ('b', ?, ?, 'resposta antiga 2', 'pt', NULL, NULL, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z')`
      ).run(fp, "Precisa de veículo próprio?");
    }, /UNIQUE/);
  });
});
