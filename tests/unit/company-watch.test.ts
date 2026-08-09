import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resetDb, REPO_ROOT } from "../helpers/sandbox.js";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import { getDb, nowIso } from "../../src/db/client.js";
import { runCompanyWatch } from "../../src/core/company-watch.js";

const HOLDING_FIXTURE = readFileSync(
  join(REPO_ROOT, "tests/fixtures/http/gupy.company-jobs.json"),
  "utf-8"
);

function seedTracks(): void {
  const db = getDb();
  const up = db.prepare(
    "INSERT INTO profile_tracks (id, name, keywords, updated_at) VALUES (?, ?, ?, ?)"
  );
  up.run("ai-builder", "AI Builder", JSON.stringify(["ai-builder", "automação", "n8n"]), nowIso());
  up.run("product", "Produto", JSON.stringify(["product manager", "product owner"]), nowIso());
}

let stub: FetchStub | undefined;
beforeEach(() => {
  resetDb();
  seedTracks();
});
afterEach(() => stub?.restore());

const ROUTES: Array<[RegExp, { body: string; status?: number }]> = [
  [/ficticia-holding\.gupy\.io/, { body: HOLDING_FIXTURE }],
  [/ficticia-falha\.gupy\.io/, { body: "erro interno", status: 500 }],
];

describe("runCompanyWatch — dry-run (default)", () => {
  it("não escreve no banco, mas reporta o que escreveria", async () => {
    stub = installFetchStub(ROUTES);
    const r = await runCompanyWatch({ companyHandle: "ficticia-holding" });

    assert.equal(r.commit, false);
    const holding = r.outcomes.find((o) => o.handle === "ficticia-holding")!;
    assert.equal(holding.found, 3);
    assert.equal(holding.filteredOut, 1, "a vaga de Motorista não bate com nenhuma keyword");
    assert.equal(holding.inserted, 2, "ai-builder + product manager passam o filtro léxico");
    assert.equal(r.scored.length, 2);

    const count = (getDb().prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n;
    assert.equal(count, 0, "dry-run não deixou nenhuma linha em jobs");
  });
});

describe("runCompanyWatch — commit", () => {
  it("insere, pontua, e a segunda execução no mesmo dia não duplica", async () => {
    stub = installFetchStub(ROUTES);
    const primeira = await runCompanyWatch({ companyHandle: "ficticia-holding", commit: true });
    assert.equal(primeira.outcomes[0]!.inserted, 2);

    const segunda = await runCompanyWatch({ companyHandle: "ficticia-holding", commit: true });
    assert.equal(segunda.outcomes[0]!.inserted, 0, "dedup por source_job_id — zero vagas novas");

    const count = (getDb().prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n;
    assert.equal(count, 2, "só as 2 que passaram o filtro, uma vez cada");
  });

  it("contagem de modalidade estruturada vs. NULL, agregada", async () => {
    stub = installFetchStub(ROUTES);
    const r = await runCompanyWatch({ companyHandle: "ficticia-holding", commit: true });
    const holding = r.outcomes[0]!;
    // As 3 vagas do fixture entram na contagem de modalidade (ela é calculada
    // no fetch, antes do filtro léxico) — 2 com modalidade, 1 sem.
    assert.deepEqual(holding.modalityStats, { withModality: 2, withoutModality: 1 });
  });
});

describe("runCompanyWatch — resiliência", () => {
  it("empresa com erro não impede as outras de processar no mesmo lote", async () => {
    stub = installFetchStub(ROUTES);
    const r = await runCompanyWatch({ commit: true }); // todas as enabled: holding + falha

    const falha = r.outcomes.find((o) => o.handle === "ficticia-falha")!;
    assert.ok(falha.error);
    assert.equal(falha.inserted, 0);

    const holding = r.outcomes.find((o) => o.handle === "ficticia-holding")!;
    assert.equal(holding.inserted, 2, "a falha da outra empresa não afetou esta");
  });

  it("empresa desabilitada nunca é buscada", async () => {
    stub = installFetchStub(ROUTES);
    await runCompanyWatch({ commit: true });
    assert.ok(!stub.calls.some((u) => u.includes("ficticia-desabilitada")));
  });
});
