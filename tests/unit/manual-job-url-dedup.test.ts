/**
 * BUG relatado pelo operador: reenviar a mesma URL em `/vaga` (fallback manual)
 * para corrigir cargo/empresa (a extração de página crua costuma errar — título
 * vem da tag <title>, empresa vem "?") criava uma linha NOVA em `jobs` a cada
 * tentativa, porque `insertJob` só dedupa por `(source, source_job_id)` — que o
 * manual nunca tem — e por `jobFingerprint` (companyName+title+location), que
 * MUDA quando o texto é corrigido. Resultado observado em produção: a mesma URL
 * do LinkedIn virou 2 linhas em `jobs` (uma com empresa "?", outra com "Nava"),
 * e uma 3ª tentativa com o mesmo texto da 2ª foi barrada com um erro sem
 * contexto ("vaga já existe no banco (fingerprint duplicado)").
 *
 * A correção: `addJobByUrl` agora checa `getJobByUrl` ANTES de inserir. Mesma
 * URL já cadastrada e ainda "new"/"queued" sem candidatura → corrige a linha
 * existente (`updateManualJobDetails`) em vez de duplicar. Mesma URL mas já
 * avançada no funil → erro explícito com o job_id, não silêncio nem duplicata.
 * URL nova mas fingerprint colide com outra vaga → erro cita QUAL vaga colidiu.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import { loadConfig } from "../../src/core/config.js";
import { addJobByUrl } from "../../src/core/manual-job.js";
import { getDb } from "../../src/db/client.js";
import { setJobStatus } from "../../src/db/repo/jobs.js";
import { createApplication } from "../../src/db/repo/applications.js";

let stub: FetchStub | undefined;
afterEach(() => stub?.restore());

const LINKEDIN_URL =
  "https://www.linkedin.com/jobs/view/4448257481/?alternateChannel=search&trackingId=Ab0C4FbWTJyFV%2B6s1GVQqg%3D%3D";

function stubLinkedinPage() {
  stub = installFetchStub([
    [
      /linkedin\.com\/jobs\/view\/4448257481/,
      {
        body: "<html><head><title>Nava | Tech for Business hiring Analista de Inteligência Artificial Pleno in Belo Horizonte, Minas Gerais, Brazil | LinkedIn</title></head><body>" +
          "descricao da vaga ".repeat(60) +
          "</body></html>",
        contentType: "text/html",
      },
    ],
  ]);
}

function countJobsByUrl(url: string): number {
  return (
    getDb().prepare("SELECT COUNT(*) c FROM jobs WHERE url = ?").get(url) as { c: number }
  ).c;
}

describe("addJobByUrl — reenvio da mesma URL corrige, não duplica", () => {
  it("1ª tentativa: extração crua sem override insere com avisos (empresa '?')", async () => {
    resetDb();
    stubLinkedinPage();
    const r = await addJobByUrl(loadConfig(), LINKEDIN_URL);
    assert.ok(r.ok, r.error);
    assert.equal(r.job!.company_name, "?");
    assert.ok(r.extractionWarnings.some((w) => w.includes("empresa não foi extraída")));
    assert.equal(countJobsByUrl(LINKEDIN_URL), 1);
  });

  it("2ª tentativa (correção com título/empresa reais): atualiza a MESMA linha, não cria outra", async () => {
    resetDb();
    stubLinkedinPage();
    const primeira = await addJobByUrl(loadConfig(), LINKEDIN_URL);
    assert.ok(primeira.ok, primeira.error);
    const idOriginal = primeira.job!.id;

    stubLinkedinPage();
    const segunda = await addJobByUrl(loadConfig(), LINKEDIN_URL, {
      title: "Analista de Inteligência Artificial Pleno",
      companyName: "Nava",
    });
    assert.ok(segunda.ok, segunda.error);
    assert.equal(segunda.job!.id, idOriginal, "corrige a linha existente em vez de inserir outra");
    assert.equal(segunda.job!.title, "Analista de Inteligência Artificial Pleno");
    assert.equal(segunda.job!.company_name, "Nava");
    assert.equal(countJobsByUrl(LINKEDIN_URL), 1, "continua havendo só 1 linha para esta URL");
  });

  it("3ª tentativa (reenviar de novo com o MESMO texto corrigido): não é erro — é a mesma correção reaplicada", async () => {
    resetDb();
    stubLinkedinPage();
    const primeira = await addJobByUrl(loadConfig(), LINKEDIN_URL);
    assert.ok(primeira.ok, primeira.error);

    stubLinkedinPage();
    const segunda = await addJobByUrl(loadConfig(), LINKEDIN_URL, {
      title: "Analista de Inteligência Artificial Pleno",
      companyName: "Nava",
    });
    assert.ok(segunda.ok, segunda.error);

    stubLinkedinPage();
    const terceira = await addJobByUrl(loadConfig(), LINKEDIN_URL, {
      title: "Analista de Inteligência Artificial Pleno",
      companyName: "Nava",
    });
    assert.ok(terceira.ok, terceira.error);
    assert.equal(terceira.job!.id, segunda.job!.id);
    assert.equal(countJobsByUrl(LINKEDIN_URL), 1);
  });

  it("URL já avançou no funil (tem candidatura): reenvio recusa e cita o job_id, não sobrescreve em silêncio", async () => {
    resetDb();
    stubLinkedinPage();
    const primeira = await addJobByUrl(loadConfig(), LINKEDIN_URL, {
      title: "Analista de Inteligência Artificial Pleno",
      companyName: "Nava",
    });
    assert.ok(primeira.ok, primeira.error);
    createApplication(primeira.job!.id, null, "output/fake-kit-dir", "review_first");

    stubLinkedinPage();
    const reenvio = await addJobByUrl(loadConfig(), LINKEDIN_URL, {
      title: "Outro Título Qualquer",
      companyName: "Outra Empresa",
    });
    assert.equal(reenvio.ok, false);
    assert.match(reenvio.error!, new RegExp(primeira.job!.id));
    assert.equal(countJobsByUrl(LINKEDIN_URL), 1, "não duplicou nem sobrescreveu");
  });

  it("URL nova mas mesma empresa+cargo de vaga já cadastrada: erro cita a vaga colidente por job_id", async () => {
    resetDb();
    stubLinkedinPage();
    const primeira = await addJobByUrl(loadConfig(), LINKEDIN_URL, {
      title: "Analista de Inteligência Artificial Pleno",
      companyName: "Nava",
    });
    assert.ok(primeira.ok, primeira.error);

    const outraUrl =
      "https://www.linkedin.com/jobs/view/9999999999/?alternateChannel=search";
    stub?.restore();
    stub = installFetchStub([
      [
        /linkedin\.com\/jobs\/view\/9999999999/,
        {
          body: "<html><head><title>outra copia do mesmo anuncio</title></head><body>" +
            "descricao da vaga ".repeat(60) +
            "</body></html>",
          contentType: "text/html",
        },
      ],
    ]);
    const segunda = await addJobByUrl(loadConfig(), outraUrl, {
      title: "Analista de Inteligência Artificial Pleno",
      companyName: "Nava",
    });
    assert.equal(segunda.ok, false);
    assert.match(segunda.error!, new RegExp(primeira.job!.id));
    assert.match(segunda.error!, /já existe no banco/);
  });

  it("URL já avançou além de new/queued sem candidatura (ex.: rejected): também recusa reenvio silencioso", async () => {
    resetDb();
    stubLinkedinPage();
    const primeira = await addJobByUrl(loadConfig(), LINKEDIN_URL);
    assert.ok(primeira.ok, primeira.error);
    setJobStatus(primeira.job!.id, "rejected");

    stubLinkedinPage();
    const reenvio = await addJobByUrl(loadConfig(), LINKEDIN_URL, {
      title: "Analista de Inteligência Artificial Pleno",
      companyName: "Nava",
    });
    assert.equal(reenvio.ok, false);
    assert.match(reenvio.error!, new RegExp(primeira.job!.id));
    assert.equal(countJobsByUrl(LINKEDIN_URL), 1);
  });
});
