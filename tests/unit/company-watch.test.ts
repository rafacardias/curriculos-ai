import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import { getDb, nowIso } from "../../src/db/client.js";
import { runCompanyWatch } from "../../src/core/company-watch.js";

/**
 * Fixture sintético próprio (não o real de company-gupy.test.ts) — este
 * arquivo testa o FILTRO LÉXICO do orquestrador, então os títulos precisam
 * bater/não bater de propósito com as trilhas semeadas abaixo. O shape (HTML
 * + __NEXT_DATA__) é o mesmo formato real; só o conteúdo é inventado.
 */
function boardHtml(jobs: unknown[]): string {
  return `<!DOCTYPE html><html><body>
    <script id="__NEXT_DATA__" type="application/json">
      ${JSON.stringify({ props: { pageProps: { careerPage: { name: "Fictícia Holding" }, jobs } } })}
    </script>
  </body></html>`;
}

const HOLDING_JOBS = [
  {
    id: 88001,
    title: "Especialista em Automação de Processos",
    type: "vacancy_type_effective",
    department: "ai-builder e n8n",
    workplace: { workplaceType: "remote", address: { city: "Belo Horizonte", stateShortName: "MG" } },
  },
  {
    id: 88002,
    title: "Product Manager Sênior",
    type: "vacancy_type_effective",
    department: "Product Owner e backlog",
    workplace: { workplaceType: "on-site", address: { city: "Belo Horizonte", stateShortName: "MG" } },
  },
  {
    id: 88003,
    title: "Motorista de Frota",
    type: "vacancy_type_effective",
    department: null,
    workplace: { workplaceType: null, address: { city: "Belo Horizonte", stateShortName: "MG" } },
  },
];
const HOLDING_FIXTURE = boardHtml(HOLDING_JOBS);

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

const ROUTES: Array<[RegExp, { body: string; status?: number; contentType?: string }]> = [
  [/ficticia-holding\.gupy\.io/, { body: HOLDING_FIXTURE, contentType: "text/html" }],
  [/ficticia-falha\.gupy\.io/, { body: "erro interno", status: 500 }],
];

describe("runCompanyWatch — dry-run (default)", () => {
  it("não escreve no banco, mas reporta o que escreveria", async () => {
    stub = installFetchStub(ROUTES);
    const r = await runCompanyWatch({ companyHandle: "ficticia-holding" });

    assert.equal(r.commit, false);
    const holding = r.outcomes.find((o) => o.handle === "ficticia-holding")!;
    assert.equal(holding.found, 3);
    assert.equal(holding.filteredOut, 1, "a vaga de Motorista não bate com nenhuma keyword (título nem departamento)");
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

  it("distribuição de workplaceType, agregada — remote/hybrid/onsite/ausente", async () => {
    stub = installFetchStub(ROUTES);
    const r = await runCompanyWatch({ companyHandle: "ficticia-holding", commit: true });
    const holding = r.outcomes[0]!;
    // As 3 vagas do fixture entram na distribuição (calculada no fetch, antes
    // do filtro léxico) — 1 remote, 0 hybrid, 1 on-site, 1 sem modalidade.
    assert.deepEqual(holding.modalityStats, { remote: 1, hybrid: 0, onsite: 1, none: 1 });
  });
});

describe("runCompanyWatch — skipLexicalFilter (medição)", () => {
  it("com a flag, a vaga barrada pelo léxico também é inserida e pontuada — mas o rollback continua valendo", async () => {
    stub = installFetchStub(ROUTES);
    const r = await runCompanyWatch({ companyHandle: "ficticia-holding", skipLexicalFilter: true });

    const holding = r.outcomes.find((o) => o.handle === "ficticia-holding")!;
    assert.equal(holding.found, 3);
    assert.equal(holding.filteredOut, 1, "continua reportando quantas TERIAM sido barradas");
    assert.equal(holding.inserted, 3, "com a flag, as 3 vagas passam — inclusive a de Motorista");
    assert.equal(r.scored.length, 3);
    assert.ok(
      r.scored.some((s) => s.title === "Motorista de Frota"),
      "a vaga que o filtro léxico barraria também chega a scoreJob com a flag ligada"
    );

    const count = (getDb().prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n;
    assert.equal(count, 0, "skipLexicalFilter não muda o dry-run — ainda é rollback garantido");
  });

  it("sem a flag (default), comportamento idêntico ao caminho já testado — filtro continua ativo", async () => {
    stub = installFetchStub(ROUTES);
    const r = await runCompanyWatch({ companyHandle: "ficticia-holding" });
    const holding = r.outcomes.find((o) => o.handle === "ficticia-holding")!;
    assert.equal(holding.inserted, 2, "sem a flag, Motorista continua barrado");
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
