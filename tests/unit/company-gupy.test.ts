import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "../helpers/sandbox.js";
import { REPO_ROOT } from "../helpers/sandbox.js";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import { fetchGupyCompanyJobs } from "../../src/adapters/company-gupy.js";

// Recortado de uma captura real de localiza.gupy.io — ver o comentário no
// próprio arquivo de fixture. 4 vagas reais (on-site/remote/hybrid/talent
// pool) + 1 sintética (workplaceType ausente, sem exemplo real disponível).
const FIXTURE = readFileSync(join(REPO_ROOT, "tests/fixtures/http/gupy.company-board.html"), "utf-8");

let stub: FetchStub | undefined;
afterEach(() => stub?.restore());

describe("fetchGupyCompanyJobs", () => {
  it("parseia __NEXT_DATA__ do HTML — não existe API JSON pública por empresa (verificado ao vivo)", async () => {
    stub = installFetchStub([[/localiza\.gupy\.io/, { body: FIXTURE, contentType: "text/html" }]]);
    const { jobs, error } = await fetchGupyCompanyJobs("localiza");

    assert.equal(error, null);
    assert.equal(jobs.length, 4, "5 no fixture, 1 é banco de talentos e é descartada");
    assert.ok(jobs.every((j) => j.source === "gupy-watch"));
    assert.equal(jobs[0]!.companyName, "Localiza&Co");
    assert.equal(jobs[0]!.sourceJobId, "localiza:11881982", "prefixado com o handle — id não é global");
    assert.equal(jobs[0]!.location, "CARAPICUIBA, SP");
  });

  it("mapeia workplaceType real (on-site/remote/hybrid) no REMOTE_MAP existente, sem alteração", async () => {
    stub = installFetchStub([[/localiza\.gupy\.io/, { body: FIXTURE, contentType: "text/html" }]]);
    const { jobs } = await fetchGupyCompanyJobs("localiza");
    const byId = Object.fromEntries(jobs.map((j) => [j.sourceJobId, j]));
    assert.equal(byId["localiza:11881982"]!.remoteType, "onsite");
    assert.equal(byId["localiza:11562902"]!.remoteType, "remote");
    assert.equal(byId["localiza:11027551"]!.remoteType, "hybrid");
    assert.equal(byId["localiza:99999999"]!.remoteType, undefined, "workplaceType null nunca vira modalidade inventada");
  });

  it("department entra em description — único texto além do título disponível sem 2º request", async () => {
    stub = installFetchStub([[/localiza\.gupy\.io/, { body: FIXTURE, contentType: "text/html" }]]);
    const { jobs } = await fetchGupyCompanyJobs("localiza");
    const agile = jobs.find((j) => j.sourceJobId === "localiza:11562902")!;
    assert.equal(agile.description, "AGILT - Agile Transformation");
  });

  it("constrói a URL da vaga a partir do id — a Gupy não devolve uma pronta neste shape", async () => {
    stub = installFetchStub([[/localiza\.gupy\.io/, { body: FIXTURE, contentType: "text/html" }]]);
    const { jobs } = await fetchGupyCompanyJobs("localiza");
    assert.equal(jobs[0]!.url, "https://localiza.gupy.io/jobs/11881982?jobBoardSource=gupy_public_page");
  });

  it("banco de talentos (vacancy_type_talent_pool) nunca vira vaga nem entra na distribuição de modalidade", async () => {
    stub = installFetchStub([[/localiza\.gupy\.io/, { body: FIXTURE, contentType: "text/html" }]]);
    const { jobs, modalityStats } = await fetchGupyCompanyJobs("localiza");
    assert.ok(!jobs.some((j) => j.title.includes("Monoperfil")), "a vaga de talent pool não aparece");
    // 1 on-site + 1 remote + 1 hybrid + 1 none = 4 — a 5ª do fixture (talent
    // pool, remote) fica de fora da contagem, não só da lista de vagas.
    assert.deepEqual(modalityStats, { remote: 1, hybrid: 1, onsite: 1, none: 1 });
  });

  it("chama o host POR EMPRESA (<handle>.gupy.io/), não o agregador", async () => {
    stub = installFetchStub([[/localiza\.gupy\.io/, { body: FIXTURE, contentType: "text/html" }]]);
    await fetchGupyCompanyJobs("localiza");
    assert.ok(stub.calls.some((u) => u.includes("localiza.gupy.io")));
    assert.ok(!stub.calls.some((u) => u.includes("employability-portal.gupy.io")));
  });

  it("__NEXT_DATA__ ausente (layout mudou, ou handle não existe) vira erro, não exceção", async () => {
    stub = installFetchStub([[/localiza\.gupy\.io/, { body: "<html><body>não é isto</body></html>" }]]);
    const { jobs, error, modalityStats } = await fetchGupyCompanyJobs("localiza");
    assert.deepEqual(jobs, []);
    assert.match(error!, /__NEXT_DATA__/);
    assert.deepEqual(modalityStats, { remote: 0, hybrid: 0, onsite: 0, none: 0 });
  });

  it("404 de verdade (handle errado — caso real: totvs.gupy.io) não lança, devolve erro", async () => {
    stub = installFetchStub([[/localiza\.gupy\.io/, { body: "not found", status: 404 }]]);
    const { jobs, error } = await fetchGupyCompanyJobs("localiza");
    assert.deepEqual(jobs, []);
    assert.match(error!, /404/);
  });
});
