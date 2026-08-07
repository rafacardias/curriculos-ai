/**
 * REQUISITO (b) da Onda 0 — smoke end-to-end do pipeline inteiro com fixtures
 * sintéticas: buscar → score → gerar → truthcheck → PDF.
 *
 * A etapa "gerar" em produção é o Claude redigindo os .md a partir do bundle.
 * No teste, um resume.md sintético pré-escrito ocupa esse lugar: ele cita
 * exatamente os fact_ids do perfil sintético e segue o mesmo formato. O que este
 * teste prova é o GUARDRAIL e o encanamento, não a qualidade da redação.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, SANDBOX_ROOT, resetSandboxData, runCli } from "../helpers/sandbox.js";
import { installFetchStub } from "../helpers/net.js";
import { allRoutes } from "../helpers/routes.js";
import { getDb } from "../../src/db/client.js";
import { runSearch } from "../../src/core/pipeline.js";
import { resolveAdapters } from "../../src/adapters/index.js";
import { scoreNewJobs, type ScoredJob } from "../../src/core/scoring.js";
import { loadConfig } from "../../src/core/config.js";
import { findChrome } from "../../src/render/pdf.js";

const SOURCES = ["remotive", "remoteok", "wwr", "gupy", "linkedin"];
const PARAMS = { query: "quality assurance", location: "Brazil", remoteOnly: true };

let chromeOk = true;
try {
  findChrome();
} catch {
  chromeOk = false;
}

let newJobIds: string[] = [];
let scored: ScoredJob[] = [];
let alvo: ScoredJob;
let kitDir: string;

before(() => {
  resetSandboxData();
  const sync = runCli("src/cli/ingest-profile.ts", ["sync"]);
  assert.equal(sync.status, 0, sync.stderr);
});

describe("smoke e2e — pipeline completo", () => {
  it("1. BUSCAR — as 5 fontes retornam e nada vaza para a rede real", async () => {
    const stub = installFetchStub(allRoutes());
    try {
      const r = await runSearch(resolveAdapters(SOURCES), PARAMS, "manual");

      for (const id of SOURCES) {
        assert.ok(r.perSource[id], `fonte ${id} não reportou`);
        assert.deepEqual(r.perSource[id]!.errors, [], `fonte ${id} reportou erro`);
      }
      assert.equal(r.newJobIds.length, 8, "8 vagas sintéticas nas fixtures");
      newJobIds = r.newJobIds;
    } finally {
      stub.restore();
    }
  });

  it("2. DEDUP — a segunda busca idêntica insere zero vagas novas", async () => {
    const stub = installFetchStub(allRoutes());
    try {
      const r = await runSearch(resolveAdapters(SOURCES), PARAMS, "manual");
      assert.equal(r.newJobIds.length, 0, "fingerprint idêntico não pode duplicar");
      assert.equal(
        Object.values(r.perSource).reduce((n, s) => n + s.found, 0),
        8,
        "continuam sendo encontradas 8 — só não são inseridas"
      );
    } finally {
      stub.restore();
    }
  });

  it("3. SEARCH_RUNS — as duas execuções ficaram auditáveis", () => {
    const rows = getDb()
      .prepare("SELECT finished_at, per_source FROM search_runs ORDER BY started_at")
      .all() as Array<{ finished_at: string | null; per_source: string | null }>;

    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.ok(row.finished_at, "toda run precisa registrar o fim");
      const per = JSON.parse(row.per_source!);
      assert.deepEqual(Object.keys(per).sort(), [...SOURCES].sort());
    }
  });

  it("4. SCORE — filtros duros barram, e os componentes somam o score", () => {
    scored = scoreNewJobs(loadConfig(), newJobIds);
    assert.equal(scored.length, 8);

    const senior = scored.find((s) => s.title === "Senior QA Engineer")!;
    assert.equal(senior.status, "new");
    assert.match(senior.policyAction, /filtrado: senioridade senior/);

    const oitoAnos = scored.find((s) => s.title === "Analista de Testes")!;
    assert.equal(oitoAnos.status, "new");
    assert.match(oitoAnos.policyAction, /filtrado: exige 8\+ anos/);

    alvo = scored.find((s) => s.title === "Analista de QA Júnior")!;
    assert.equal(alvo.status, "queued");
    assert.equal(alvo.trackHint, "qa", "a trilha sintética precisa ser detectada");

    for (const s of scored) {
      const soma = Object.values(s.scoreDetail).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(soma - s.score) < 0.01, `${s.title}: componentes não somam o score`);
    }
  });

  it("5. GERAR (prepare) — bundle completo e SEM os valores dos candidate_facts", () => {
    const r = runCli("src/cli/kit.ts", ["prepare", alvo.jobId]);
    assert.equal(r.status, 0, r.stderr);

    const dirs = readdirSync(join(SANDBOX_ROOT, "output")).filter((d) => d !== "_jd-snapshots");
    assert.equal(dirs.length, 1);
    kitDir = join(SANDBOX_ROOT, "output", dirs[0]!);

    const bundle = JSON.parse(readFileSync(join(kitDir, "bundle.json"), "utf-8"));
    assert.deepEqual(bundle.expected_files, ["resume.md", "cover-letter.md", "answers.md", "outreach.md"]);
    assert.equal(bundle.job.id, alvo.jobId);
    assert.ok(bundle.jd_keywords.length > 0);
    assert.equal(bundle.tracks.length, 2, "as 2 trilhas sintéticas");
    assert.ok(["A", "B"].includes(bundle.variant.id), "o experiment engine atribui variante");

    // CONTRATO REVERTIDO EM 2026-08-07 — e a reversão fica escrita aqui, porque
    // o contrato anterior era deliberado, não descuido.
    //
    // Antes: o bundle levava só as CHAVES dos candidate_facts, "nunca os valores
    // (pretensão salarial, PCD, etc)". A intenção era privacidade.
    //
    // Por que caiu, medido: o redator via o NOME do dado e não o dado, e ia
    // buscá-lo no disco — 7 dos 38 turnos da geração da Techne (4 Greps por
    // `candidate_facts`, mais profile.ts, mais CANDIDATE_FACTS_PATH, mais o
    // YAML). E a fronteira não protegia o que dizia proteger: o bundle já leva o
    // `profile` inteiro (nome, e-mail, telefone, histórico), e os candidate_facts
    // são justamente os dados que vão ser DIGITADOS no formulário do empregador.
    // Esconder do redator o que o formulário vai receber não é privacidade, é
    // custo.
    //
    // É reversível em uma linha (`.map(f => ({key: f.key, language: f.language}))`
    // em src/cli/kit.ts) se o operador discordar.
    assert.ok(bundle.candidate_facts.length > 0);
    for (const f of bundle.candidate_facts) {
      assert.deepEqual(Object.keys(f).sort(), ["key", "language", "value"]);
      assert.ok(typeof f.value === "string" && f.value.length > 0, "valor presente e não vazio");
    }
  });

  it("6. TRUTHCHECK + FINALIZE — kit válido passa e registra tudo", () => {
    const fx = join(REPO_ROOT, "tests/fixtures/kit");
    copyFileSync(join(fx, "resume.ok.md"), join(kitDir, "resume.md"));
    copyFileSync(join(fx, "cover-letter.md"), join(kitDir, "cover-letter.md"));
    // Os quatro entregáveis: desde os gates da Onda 2 o finalize cobra
    // `expected_files` inteiro, e não só o currículo.
    copyFileSync(join(fx, "answers.md"), join(kitDir, "answers.md"));
    copyFileSync(join(fx, "outreach.md"), join(kitDir, "outreach.md"));

    const r = runCli("src/cli/kit.ts", ["finalize", alvo.jobId]);
    assert.equal(r.status, 0, `finalize falhou: ${r.stderr}`);
    assert.match(r.stdout, /truthcheck OK: 5 fatos citados/);
    assert.match(r.stdout, /coverage: \d+%/);

    const coverage = readFileSync(join(kitDir, "coverage-report.md"), "utf-8");
    assert.match(coverage, /estimativa heurística/, "o ATS score precisa continuar rotulado");
    assert.doesNotMatch(coverage, /\[exp:/, "as citações são removidas antes do relatório");

    const db = getDb();
    const app = db
      .prepare("SELECT id, status, kit_dir FROM applications WHERE job_id = ?")
      .get(alvo.jobId) as { id: string; status: string; kit_dir: string };
    assert.equal(app.status, "kit_ready");
    assert.equal(app.kit_dir, kitDir);

    const rv = db
      .prepare("SELECT version, truthcheck, keyword_report, variant FROM resume_versions WHERE application_id = ?")
      .get(app.id) as { version: number; truthcheck: string; keyword_report: string; variant: string };
    assert.equal(rv.version, 1);
    const tc = JSON.parse(rv.truthcheck);
    assert.equal(tc.ok, true);
    assert.deepEqual(tc.invalid, []);
    assert.ok(JSON.parse(rv.keyword_report).jdKeywords.length > 0);
    assert.ok(JSON.parse(rv.variant).id);
  });

  it(
    "7. PDF — currículo e cover letter renderizados pelo Chrome do sistema",
    { skip: chromeOk ? false : "Chrome não instalado nesta máquina" },
    () => {
      for (const name of ["resume.pdf", "cover-letter.pdf"]) {
        const p = join(kitDir, name);
        assert.equal(existsSync(p), true, `${name} não foi gerado`);
        assert.ok(statSync(p).size > 5000, `${name} é pequeno demais para ter conteúdo`);
        const buf = readFileSync(p);
        assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-", `${name} não é um PDF`);
      }
    }
  );

  // LIMITAÇÃO HONESTA: provar que o PDF tem camada de texto extraível por um ATS
  // exigiria um parser de PDF, ou seja, uma dependência nova. Ver KNOWN-BUGS.md.
  // 8. "PDF tem camada de texto extraível por ATS" era um `todo` aqui (LIM-001).
  //    Fechado: a prova vive em tests/e2e/kit-ats-gate.test.ts, com parser de
  //    verdade, agora que `unpdf` entrou como devDependency.
});
