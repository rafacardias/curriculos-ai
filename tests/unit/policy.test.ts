import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { getDb, nowIso } from "../../src/db/client.js";
import { loadConfig, type AppConfig } from "../../src/core/config.js";
import { decidePolicy } from "../../src/core/policy.js";
import { insertJob, getJob } from "../../src/db/repo/jobs.js";
import { createApplication } from "../../src/db/repo/applications.js";
import type { RawJob } from "../../src/core/types.js";

let config: AppConfig;
before(() => {
  config = loadConfig();
});

const mkJob = (over: Partial<RawJob> = {}) => {
  const row = insertJob({
    source: "gupy",
    url: "https://ficticia.gupy.io/job/1",
    title: "Analista de QA",
    companyName: "ACME",
    language: "pt",
    ...over,
  })!;
  return getJob(row.id)!;
};

/** applications.track_id é FK para profile_tracks — a trilha precisa existir. */
function seedTracks(): void {
  resetDb();
  getDb()
    .prepare("INSERT INTO profile_tracks (id, name, keywords, updated_at) VALUES (?, ?, ?, ?)")
    .run("qa", "Quality Assurance", JSON.stringify(["qa", "teste"]), nowIso());
}

describe("decidePolicy — cascata de regras", () => {
  beforeEach(seedTracks);

  it("score abaixo do mínimo bloqueia a geração", () => {
    const d = decidePolicy(config, mkJob(), config.policy.generate_min_score - 1, "qa");
    assert.equal(d.shouldGenerate, false);
    assert.equal(d.rule, "generate_min_score");
    assert.equal(d.submissionMode, null);
    assert.match(d.action, /^ignorar: score/);
  });

  it("cooldown de empresa tem precedência sobre o caminho default", () => {
    const job = mkJob();
    const outro = mkJob({ url: "https://ficticia.gupy.io/job/2", title: "Analista de Suporte" });
    const app = createApplication(outro.id, "qa", "/tmp/kit", "review_first");
    getDb().prepare("UPDATE applications SET applied_at = ? WHERE id = ?").run(nowIso(), app.id);

    const d = decidePolicy(config, job, 90, "qa");
    assert.equal(d.shouldGenerate, false);
    assert.equal(d.rule, "cooldown_same_company_days");
  });

  it("cap semanal por trilha bloqueia quando estourado", () => {
    const cfg = {
      ...config,
      policy: { ...config.policy, weekly_cap_per_track: 1, cooldown_same_company_days: 0 },
    };
    const antigo = mkJob({ url: "https://outra.gupy.io/job/9", companyName: "Outra Empresa" });
    const app = createApplication(antigo.id, "qa", "/tmp/kit", "review_first");
    getDb().prepare("UPDATE applications SET applied_at = ? WHERE id = ?").run(nowIso(), app.id);

    const d = decidePolicy(cfg, mkJob(), 90, "qa");
    assert.equal(d.rule, "weekly_cap_per_track");
    assert.match(d.action, /cap semanal/);
  });

  it("caminho default usa o modo configurado para a plataforma", () => {
    const d = decidePolicy(config, mkJob(), 90, "qa");
    assert.equal(d.shouldGenerate, true);
    assert.equal(d.rule, "default");
    assert.equal(d.submissionMode, "review_first");
    assert.equal(d.action, "gerar + review_first");
  });

  it("full_auto é rebaixado para review_first quando o score não alcança o mínimo", () => {
    const cfg = {
      ...config,
      submission: { ...config.submission, per_platform: { gupy: "full_auto" as const } },
    };
    const abaixo = decidePolicy(cfg, mkJob(), config.policy.full_auto_min_score - 1, "qa");
    assert.equal(abaixo.submissionMode, "review_first");

    const acima = decidePolicy(
      cfg,
      mkJob({ url: "https://ficticia.gupy.io/job/3", title: "Outro Cargo" }),
      95,
      "qa"
    );
    assert.equal(acima.submissionMode, "full_auto");
  });

  it("fonte bloqueada nunca vai a full_auto, mesmo com score alto", () => {
    const cfg = {
      ...config,
      submission: { ...config.submission, per_platform: { linkedin: "full_auto" as const } },
    };
    const job = mkJob({ source: "linkedin", url: "https://br.linkedin.com/jobs/view/1" });
    assert.equal(decidePolicy(cfg, job, 100, "qa").submissionMode, "review_first");
  });

  it("LinkedIn exige i_accept_ban_risk explícito para full_auto", () => {
    const semRisco = {
      ...config,
      submission: {
        ...config.submission,
        per_platform: { linkedin: "full_auto" as const },
        i_accept_ban_risk: false,
      },
      policy: { ...config.policy, full_auto_blocked_sources: [] },
    };
    const job = mkJob({ source: "linkedin", url: "https://br.linkedin.com/jobs/view/2" });
    assert.equal(decidePolicy(semRisco, job, 100, "qa").submissionMode, "review_first");

    const comRisco = { ...semRisco, submission: { ...semRisco.submission, i_accept_ban_risk: true } };
    assert.equal(decidePolicy(comRisco, job, 100, "qa").submissionMode, "full_auto");
  });

  it("toda decisão é auditável em events", () => {
    const job = mkJob();
    decidePolicy(config, job, 90, "qa");
    const ev = getDb()
      .prepare("SELECT entity, entity_id, type, payload FROM events WHERE entity = 'policy'")
      .get() as { entity: string; entity_id: string; type: string; payload: string };

    assert.equal(ev.type, "policy_decision");
    assert.equal(ev.entity_id, job.id);
    const payload = JSON.parse(ev.payload);
    assert.equal(payload.score, 90);
    assert.equal(payload.rule, "default");
  });
});
