/**
 * `answer_bank` — UNIQUE por `(question_fingerprint, language, track_id,
 * company_id)`, via 4 índices únicos parciais (008_answer_bank_dedup.sql).
 * Existe porque `answers.ts:45` fazia UPDATE-or-INSERT contra essa tupla sem
 * NENHUMA constraint de schema a garantir — duas linhas duplicadas eram
 * possíveis a nível de banco, decisão de "qual vence" ficando por conta da
 * ordem de leitura (mesma classe do BUG-010). Registrado em KNOWN-BUGS.md,
 * `answers.ts:45`.
 *
 * Quatro índices, não um: SQLite não trata `NULL IS NULL` como colisão num
 * UNIQUE simples, então a tupla mais comum (sem trilha, sem empresa) ficaria
 * destravada por um `UNIQUE(a,b,c,d)` ingênuo.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ulid } from "ulid";
import { resetDb } from "../helpers/sandbox.js";
import { getDb, nowIso } from "../../src/db/client.js";
import { normalize } from "../../src/core/dedup.js";
import { upsertCompany } from "../../src/db/repo/companies.js";
import { createTrack } from "../../src/db/repo/profile-tracks.js";

beforeEach(() => resetDb());

function insertAnswer(opts: {
  question: string;
  language?: string;
  trackId?: string | null;
  companyId?: string | null;
}): void {
  const db = getDb();
  const fp = normalize(opts.question);
  db.prepare(
    `INSERT INTO answer_bank (id, question_fingerprint, question_text, answer, language, track_id, company_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ulid(),
    fp,
    opts.question,
    "resposta",
    opts.language ?? "pt",
    opts.trackId ?? null,
    opts.companyId ?? null,
    nowIso(),
    nowIso()
  );
}

describe("answer_bank — UNIQUE em (question_fingerprint, language, track_id, company_id)", () => {
  it("sem trilha, sem empresa: segunda linha idêntica é rejeitada", () => {
    insertAnswer({ question: "Você tem CNH?" });
    assert.throws(() => insertAnswer({ question: "Você tem CNH?" }), /UNIQUE/);
  });

  it("com trilha, sem empresa: segunda linha idêntica é rejeitada", () => {
    const track = createTrack({ id: "ai-builder-test", name: "AI Builder", keywords: ["ia"] });
    insertAnswer({ question: "Pretensão salarial?", trackId: track.id });
    assert.throws(
      () => insertAnswer({ question: "Pretensão salarial?", trackId: track.id }),
      /UNIQUE/
    );
  });

  it("sem trilha, com empresa: segunda linha idêntica é rejeitada", () => {
    const company = upsertCompany("Fictícia Holding");
    insertAnswer({ question: "Por que quer trabalhar aqui?", companyId: company.id });
    assert.throws(
      () => insertAnswer({ question: "Por que quer trabalhar aqui?", companyId: company.id }),
      /UNIQUE/
    );
  });

  it("com trilha e com empresa: segunda linha idêntica é rejeitada", () => {
    const track = createTrack({ id: "ai-builder-test2", name: "AI Builder", keywords: ["ia"] });
    const company = upsertCompany("Outra Fictícia");
    insertAnswer({ question: "Disponibilidade de início?", trackId: track.id, companyId: company.id });
    assert.throws(
      () =>
        insertAnswer({
          question: "Disponibilidade de início?",
          trackId: track.id,
          companyId: company.id,
        }),
      /UNIQUE/
    );
  });

  it("mesma pergunta, trilha DIFERENTE: não colide — são segmentos distintos", () => {
    const trackA = createTrack({ id: "track-a", name: "A", keywords: ["a"] });
    const trackB = createTrack({ id: "track-b", name: "B", keywords: ["b"] });
    insertAnswer({ question: "Pretensão salarial?", trackId: trackA.id });
    assert.doesNotThrow(() => insertAnswer({ question: "Pretensão salarial?", trackId: trackB.id }));
  });

  it("mesma pergunta, IDIOMA diferente: não colide", () => {
    insertAnswer({ question: "Do you have a driver's license?", language: "en" });
    assert.doesNotThrow(() =>
      insertAnswer({ question: "Do you have a driver's license?", language: "pt" })
    );
  });

  it("linha sem trilha/empresa e linha COM trilha para a mesma pergunta: não colidem entre si — segmentos diferentes do índice parcial", () => {
    const track = createTrack({ id: "track-c", name: "C", keywords: ["c"] });
    insertAnswer({ question: "Você tem CNH?" });
    assert.doesNotThrow(() => insertAnswer({ question: "Você tem CNH?", trackId: track.id }));
  });

  it("registros pré-existentes distintos sobrevivem à migration (não há dedup automático, só passa a barrar duplicata NOVA)", () => {
    const track = createTrack({ id: "track-d", name: "D", keywords: ["d"] });
    insertAnswer({ question: "Pergunta 1" });
    insertAnswer({ question: "Pergunta 2", trackId: track.id });
    const rows = getDb().prepare("SELECT COUNT(*) AS c FROM answer_bank").get() as { c: number };
    assert.equal(rows.c, 2);
  });
});
