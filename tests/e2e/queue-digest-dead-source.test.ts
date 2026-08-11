/**
 * O alerta de fonte morta só existe se ele APARECE no `/status` — que é o
 * `queue.ts --digest` rodando de verdade. Por isso aqui é spawn do CLI e
 * asserção sobre o stdout, não chamada da função de leitura (essa está coberta
 * em tests/unit/source-health.test.ts).
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ulid } from "ulid";
import { join } from "node:path";
import { REPO_ROOT, resetDb, runCli } from "../helpers/sandbox.js";
import { getDb } from "../../src/db/client.js";

const QUEUE_CLI = join(REPO_ROOT, "src/cli/queue.ts");

type Stats = { found: number; new: number; errors: string[] };
const ok = (): Stats => ({ found: 3, new: 1, errors: [] });
const falha = (msg: string): Stats => ({ found: 0, new: 0, errors: [msg] });

let minuto = 0;
function corrida(perSource: Record<string, Stats>): void {
  const startedAt = new Date(Date.UTC(2026, 7, 1, 10, minuto++)).toISOString();
  getDb()
    .prepare(
      `INSERT INTO search_runs (id, mode, query, started_at, finished_at, per_source)
       VALUES (?, 'auto', 'qa junior', ?, ?, ?)`
    )
    .run(ulid(), startedAt, startedAt, JSON.stringify(perSource));
}

const digest = (): string => {
  const r = runCli(QUEUE_CLI, ["--digest"]);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

describe("queue --digest — alerta de fonte morta", () => {
  beforeEach(() => {
    resetDb();
    minuto = 0;
  });

  it("2 falhas seguidas viram alerta nomeando fonte, erro e tempo sem sucesso", () => {
    corrida({ linkedin: ok() });
    corrida({ linkedin: falha("timeout 30000ms") });
    corrida({ linkedin: falha("timeout 30000ms") });

    const out = digest();
    assert.match(out, /⛔ fonte morta — linkedin/);
    assert.match(out, /timeout 30000ms/);
    assert.match(out, /sem sucesso há \d+h/);
    // O ⚠ da última corrida continua existindo — o alerta soma, não substitui.
    assert.match(out, /⚠ linkedin: timeout 30000ms/);
  });

  it("falha isolada não vira alerta de fonte morta", () => {
    corrida({ remotive: ok() });
    corrida({ remotive: ok() });
    corrida({ remotive: falha("500 Internal Server Error") });

    const out = digest();
    assert.match(out, /⚠ remotive: 500 Internal Server Error/, "o aviso da última corrida fica");
    assert.doesNotMatch(out, /fonte morta/);
  });

  it("sem corrida nenhuma o digest não inventa alerta", () => {
    const out = digest();
    assert.match(out, /última busca: nunca rodou/);
    assert.doesNotMatch(out, /fonte morta/);
  });
});
