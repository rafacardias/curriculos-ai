import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { runSearch } from "../../src/core/pipeline.js";
import { getDb } from "../../src/db/client.js";
import type { JobSourceAdapter } from "../../src/adapters/types.js";
import type { RawJob } from "../../src/core/types.js";

const fake = (id: string, jobs: RawJob[] = [], fail = false): JobSourceAdapter => ({
  id,
  async search() {
    if (fail) throw new Error("adapter explodiu");
    return { jobs, errors: [] };
  },
});

const job = (over: Partial<RawJob> = {}): RawJob => ({
  source: "remotive",
  url: "https://exemplo.com/v/1",
  title: "Analista de QA",
  companyName: "ACME",
  language: "pt",
  ...over,
});

describe("runSearch", () => {
  beforeEach(() => resetDb());

  it("BUG-003: não deixa timer pendente segurando o event loop", () => {
    // O Promise.race cria um setTimeout de 30s que nunca era limpo. Cada arquivo
    // de teste que chamasse runSearch pendurava o processo por até meio minuto —
    // é o único bug que IMPEDIA a rede de segurança de existir, por isso foi
    // corrigido já na Onda 0 em vez de congelado.
    const antes = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
    return runSearch([fake("a"), fake("b")], { query: "x" }, "manual").then(() => {
      const depois = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
      assert.equal(depois, antes, "runSearch deixou timer pendente");
    });
  });

  it("isola falha por adapter: um quebrado não derruba os outros", async () => {
    const r = await runSearch([fake("bom", [job()]), fake("ruim", [], true)], { query: "x" }, "manual");
    assert.equal(r.perSource.bom!.found, 1);
    assert.equal(r.perSource.bom!.new, 1);
    assert.equal(r.perSource.ruim!.found, 0);
    assert.match(r.perSource.ruim!.errors[0]!, /adapter explodiu/);
  });

  it("dedup: a segunda execução com as mesmas vagas insere zero novas", async () => {
    const jobs = [job(), job({ url: "https://exemplo.com/v/2", title: "Analista de Suporte" })];
    const primeira = await runSearch([fake("a", jobs)], { query: "x" }, "manual");
    assert.equal(primeira.newJobIds.length, 2);

    const segunda = await runSearch([fake("a", jobs)], { query: "x" }, "manual");
    assert.equal(segunda.newJobIds.length, 0, "fingerprint idêntico não pode inserir de novo");
    assert.equal(segunda.perSource.a!.found, 2, "encontradas continuam sendo 2");
    assert.equal(segunda.perSource.a!.new, 0);
  });

  it("registra a execução em search_runs com per_source parseável", async () => {
    await runSearch([fake("a", [job()])], { query: "quality assurance" }, "manual");
    const row = getDb()
      .prepare("SELECT mode, query, started_at, finished_at, per_source FROM search_runs")
      .get() as { mode: string; query: string; started_at: string; finished_at: string; per_source: string };

    assert.equal(row.mode, "manual");
    assert.equal(row.query, "quality assurance");
    assert.ok(row.started_at && row.finished_at, "a run precisa ter início e fim");
    const perSource = JSON.parse(row.per_source);
    assert.deepEqual(Object.keys(perSource), ["a"]);
    assert.equal(perSource.a.found, 1);
  });
});
