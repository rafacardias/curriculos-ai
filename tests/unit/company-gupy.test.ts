import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "../helpers/sandbox.js";
import { REPO_ROOT } from "../helpers/sandbox.js";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import { fetchGupyCompanyJobs } from "../../src/adapters/company-gupy.js";

const FIXTURE = readFileSync(join(REPO_ROOT, "tests/fixtures/http/gupy.company-jobs.json"), "utf-8");

let stub: FetchStub | undefined;
afterEach(() => stub?.restore());

describe("fetchGupyCompanyJobs", () => {
  it("mapeia pro mesmo RawJob do adapter de busca, com source gupy-watch", async () => {
    stub = installFetchStub([[/ficticia-holding\.gupy\.io/, { body: FIXTURE }]]);
    const { jobs, error, modalityStats } = await fetchGupyCompanyJobs("ficticia-holding");

    assert.equal(error, null);
    assert.equal(jobs.length, 3);
    assert.ok(jobs.every((j) => j.source === "gupy-watch"));
    assert.equal(jobs[0]!.sourceJobId, "ficticia-holding:88001", "prefixado com o handle — id da Gupy não é global");
    assert.equal(jobs[0]!.location, "Belo Horizonte, MG");
    assert.equal(jobs[0]!.remoteType, "remote");
    assert.equal(jobs[1]!.remoteType, "onsite");

    // A vaga 88003 (Motorista) não tem workplaceType nem isRemoteWork — nunca
    // inventa modalidade a partir de texto livre, mesmo achando pistas na
    // descrição (ela não tem nenhuma, de propósito).
    assert.equal(jobs[2]!.remoteType, undefined);
  });

  it("registra a contagem de modalidade estruturada vs. NULL — o número que decide se o gargalo do exit 5 encolhe", async () => {
    stub = installFetchStub([[/ficticia-holding\.gupy\.io/, { body: FIXTURE }]]);
    const { modalityStats } = await fetchGupyCompanyJobs("ficticia-holding");
    assert.deepEqual(modalityStats, { withModality: 2, withoutModality: 1 });
  });

  it("chama o host POR EMPRESA (<handle>.gupy.io), não o agregador", async () => {
    stub = installFetchStub([[/ficticia-holding\.gupy\.io/, { body: FIXTURE }]]);
    await fetchGupyCompanyJobs("ficticia-holding");
    assert.ok(stub.calls.some((u) => u.includes("ficticia-holding.gupy.io")));
    assert.ok(!stub.calls.some((u) => u.includes("employability-portal.gupy.io")));
  });

  it("erro de rede não lança — devolve jobs vazio e o erro como string", async () => {
    stub = installFetchStub([[/ficticia-holding\.gupy\.io/, { body: "not json", status: 500 }]]);
    const { jobs, error, modalityStats } = await fetchGupyCompanyJobs("ficticia-holding");
    assert.deepEqual(jobs, []);
    assert.ok(error);
    assert.deepEqual(modalityStats, { withModality: 0, withoutModality: 0 });
  });
});
