/**
 * `answers add` busca a linha existente da tupla de dedup sem `ORDER BY`
 * (`src/cli/answers.ts:45`) — candidato a bug registrado em KNOWN-BUGS.md,
 * BUG-010 → "Varredura". A tabela também não tem `UNIQUE` nessa tupla (só
 * índice não-único em `question_fingerprint, language` — `001_init.sql:105`),
 * então duas linhas duplicadas SÃO possíveis (dado histórico, race hipotética
 * — o comando `add` de hoje evita criar, mas não impede que já existam).
 *
 * Escopo fechado a `ORDER BY`: torna qual linha recebe o `UPDATE`
 * determinístico. Não adiciona `UNIQUE` — isso exige migration e uma decisão
 * de schema (NULL em `track_id`/`company_id` não colide por padrão num
 * índice único do SQLite, então a constraint certa não é um `UNIQUE` simples)
 * que fica registrada, não decidida aqui.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ulid } from "ulid";
import { resetDb, runCli } from "../helpers/sandbox.js";
import { getDb } from "../../src/db/client.js";
import { normalize } from "../../src/core/dedup.js";

beforeEach(() => resetDb());

describe("answers add — desempate determinístico entre duplicatas na tupla de dedup", () => {
  it("com duas linhas duplicadas pré-existentes, o UPDATE vai sempre para a mais recentemente atualizada", () => {
    const db = getDb();
    const fp = normalize("Você tem CNH?");
    const antigo = new Date(Date.now() - 60_000).toISOString();
    const recente = new Date().toISOString();

    const idAntigo = ulid();
    const idRecente = ulid();
    // Ordem de inserção deliberada: a linha ANTIGA primeiro, a RECENTE depois
    // — sem ORDER BY, a varredura de tabela do SQLite devolve a primeira
    // inserida primeiro, então o bug (sem fix) atualizaria a ANTIGA.
    db.prepare(
      `INSERT INTO answer_bank (id, question_fingerprint, question_text, answer, language, track_id, company_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pt', NULL, NULL, ?, ?)`
    ).run(idAntigo, fp, "Você tem CNH?", "resposta antiga 1", antigo, antigo);
    db.prepare(
      `INSERT INTO answer_bank (id, question_fingerprint, question_text, answer, language, track_id, company_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pt', NULL, NULL, ?, ?)`
    ).run(idRecente, fp, "Você tem CNH?", "resposta antiga 2", recente, recente);

    const result = runCli("src/cli/answers.ts", ["add", "Você tem CNH?", "resposta nova", "--lang", "pt"]);
    assert.equal(result.status, 0, result.stderr);

    const rows = db
      .prepare("SELECT id, answer FROM answer_bank WHERE question_fingerprint = ?")
      .all(fp) as Array<{ id: string; answer: string }>;
    assert.equal(rows.length, 2, "add não cria linha nova nem apaga duplicata — só decide qual delas atualiza");

    const atualizada = rows.find((r) => r.answer === "resposta nova");
    assert.ok(atualizada, "uma das duas linhas tem que ter recebido a resposta nova");
    assert.equal(
      atualizada!.id,
      idRecente,
      "o desempate tem que escolher sempre a mesma linha — a mais recentemente atualizada, não a primeira que a varredura de tabela devolver"
    );
  });

  it("o mesmo cenário, com as linhas inseridas na ordem OPOSTA, dá o mesmo resultado", () => {
    // Prova a determinismo diretamente: inverter a ordem de INSERÇÃO não pode
    // inverter o vencedor — só o `updated_at` decide.
    const db = getDb();
    const fp = normalize("Precisa de veículo próprio?");
    const antigo = new Date(Date.now() - 60_000).toISOString();
    const recente = new Date().toISOString();

    const idRecente = ulid();
    const idAntigo = ulid();
    db.prepare(
      `INSERT INTO answer_bank (id, question_fingerprint, question_text, answer, language, track_id, company_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pt', NULL, NULL, ?, ?)`
    ).run(idRecente, fp, "Precisa de veículo próprio?", "resposta antiga 1", recente, recente);
    db.prepare(
      `INSERT INTO answer_bank (id, question_fingerprint, question_text, answer, language, track_id, company_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pt', NULL, NULL, ?, ?)`
    ).run(idAntigo, fp, "Precisa de veículo próprio?", "resposta antiga 2", antigo, antigo);

    const result = runCli("src/cli/answers.ts", ["add", "Precisa de veículo próprio?", "resposta nova", "--lang", "pt"]);
    assert.equal(result.status, 0, result.stderr);

    const rows = db
      .prepare("SELECT id, answer FROM answer_bank WHERE question_fingerprint = ?")
      .all(fp) as Array<{ id: string; answer: string }>;
    const atualizada = rows.find((r) => r.answer === "resposta nova");
    assert.equal(atualizada!.id, idRecente);
  });
});
