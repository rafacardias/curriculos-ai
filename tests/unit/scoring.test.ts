import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { loadConfig, type AppConfig } from "../../src/core/config.js";
import { scoreJob, scoreNewJobs } from "../../src/core/scoring.js";
import { insertJob, getJob } from "../../src/db/repo/jobs.js";
import type { RawJob } from "../../src/core/types.js";

let config: AppConfig;
before(() => {
  config = loadConfig();
});

const raw = (over: Partial<RawJob> = {}): RawJob => ({
  source: "remotive",
  url: "https://exemplo.com/vaga/1",
  title: "Qualquer Coisa",
  companyName: "ACME",
  language: "en",
  ...over,
});

describe("scoreJob — composição dos 5 componentes", () => {
  beforeEach(() => resetDb());

  it("BUG-002 CONGELADO: sem profile_tracks o piso é 41.5, ACIMA do queue_threshold 40", () => {
    // Aritmética do fallback morto (scoring.ts:50 → overlap = 0.3):
    //   keyword_overlap 0.3 × 0.55 × 100 = 16.5
    //   recency         0.5 × 0.15 × 100 =  7.5   (posted_at nulo)
    //   location_fit    0.5 × 0.15 × 100 =  7.5   (remote_type nulo, location nulo)
    //   language_fit    1.0 × 0.05 × 100 =  5.0   (en)
    //   preference      0.5 × 0.10 × 100 =  5.0   (nenhum peso aprendido)
    //                                     ------
    //                                       41.5  >  40  → a fila enche indiscriminadamente
    //
    // Comportamento ATUAL congelado. Quando a Onda 1 corrigir o fallback,
    // ESTE TESTE DEVE FALHAR e ser reescrito com o novo piso.
    const job = insertJob(raw())!;
    const { score, detail } = scoreJob(config, getJob(job.id)!);

    assert.equal(detail.keyword_overlap, 16.5);
    assert.equal(detail.recency, 7.5);
    assert.equal(detail.location_fit, 7.5);
    assert.equal(detail.language_fit, 5);
    assert.equal(detail.preference, 5);
    assert.equal(score, 41.5);
    assert.ok(score >= config.queue_threshold, "o piso passa do threshold — esse é o bug");

    const [scored] = scoreNewJobs(config, [job.id]);
    assert.equal(scored!.status, "queued");
  });

  it("os componentes sempre somam o score", () => {
    const job = insertJob(raw({ remoteType: "remote", location: "Brazil" }))!;
    const { score, detail } = scoreJob(config, getJob(job.id)!);
    const soma = Object.values(detail).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(soma - score) < 0.01, `soma ${soma} != score ${score}`);
  });

  it("remoto pontua location_fit cheio; onsite fora do Brasil pontua quase zero", () => {
    const remoto = insertJob(raw({ url: "https://x/1", remoteType: "remote" }))!;
    const fora = insertJob(raw({ url: "https://x/2", title: "Outra Coisa", remoteType: "onsite", location: "Berlin, Germany" }))!;
    assert.equal(scoreJob(config, getJob(remoto.id)!).detail.location_fit, 15);
    assert.equal(scoreJob(config, getJob(fora.id)!).detail.location_fit, 1.5);
  });

  it("recência decai em 21 dias", () => {
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    const antigo = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const a = insertJob(raw({ url: "https://x/3", postedAt: ontem }))!;
    const b = insertJob(raw({ url: "https://x/4", title: "Outra Vaga Aqui", postedAt: antigo }))!;
    assert.ok(scoreJob(config, getJob(a.id)!).detail.recency! > 13, "vaga de ontem tem recência alta");
    assert.equal(scoreJob(config, getJob(b.id)!).detail.recency, 0, "vaga de 40 dias zera a recência");
  });

  it("idioma fora de pt/en pontua metade", () => {
    const job = insertJob(raw({ language: "de" as RawJob["language"] }))!;
    assert.equal(scoreJob(config, getJob(job.id)!).detail.language_fit, 2.5);
  });
});

describe("scoreNewJobs — filtros duros", () => {
  beforeEach(() => resetDb());

  it("senioridade excluída sai da fila com o motivo registrado", () => {
    const job = insertJob(raw({ title: "Senior QA Engineer" }))!;
    const [r] = scoreNewJobs(config, [job.id]);
    assert.equal(r!.status, "new");
    assert.match(r!.policyAction, /filtrado: senioridade senior/);
  });

  it("anos exigidos acima do teto saem da fila", () => {
    const job = insertJob(
      raw({ title: "Analista de Testes", description: "Exigimos 8 anos de experiência com automação." })
    )!;
    const [r] = scoreNewJobs(config, [job.id]);
    assert.equal(r!.status, "new");
    assert.match(r!.policyAction, /filtrado: exige 8\+ anos/);
  });

  it("exclude_title_keywords casa palavra inteira, não substring", () => {
    const cfg = { ...config, filters: { ...config.filters, exclude_title_keywords: ["PL"] } };
    const pleno = insertJob(raw({ url: "https://x/10", title: "Analista de QA PL" }))!;
    const plsql = insertJob(raw({ url: "https://x/11", title: "Desenvolvedor PL SQL Pleno" }))!;
    const limpo = insertJob(raw({ url: "https://x/12", title: "Analista de Suporte" }))!;

    assert.match(scoreNewJobs(cfg, [pleno.id])[0]!.policyAction, /título contém "PL"/);
    // "PL SQL" tem "pl" como palavra inteira → também casa. Documenta o comportamento real:
    // o filtro por título é lexical e não conhece a exceção PL/SQL do detectSeniority.
    assert.match(scoreNewJobs(cfg, [plsql.id])[0]!.policyAction, /título contém "PL"/);
    assert.doesNotMatch(scoreNewJobs(cfg, [limpo.id])[0]!.policyAction, /título contém/);
  });

  it("retorna ordenado por score decrescente", () => {
    const a = insertJob(raw({ url: "https://x/20", title: "Vaga Remota Boa", remoteType: "remote" }))!;
    const b = insertJob(raw({ url: "https://x/21", title: "Vaga Presencial Fora", remoteType: "onsite", location: "Berlin" }))!;
    const r = scoreNewJobs(config, [b.id, a.id]);
    assert.ok(r[0]!.score >= r[1]!.score);
  });
});
