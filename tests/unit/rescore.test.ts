/**
 * `rescore` é a primeira mutação EM MASSA no banco real do operador. Estes testes
 * congelam as guardas que tornam isso aceitável — cada `it` abaixo corresponde a
 * uma guarda acordada, e não a uma unidade de código.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ulid } from "ulid";
import { resetDb } from "../helpers/sandbox.js";
import { getDb, nowIso } from "../../src/db/client.js";
import { loadConfig, type AppConfig } from "../../src/core/config.js";
import { rescoreAll, scoreNewJobs } from "../../src/core/scoring.js";
import { insertJob, getJob, setJobStatus } from "../../src/db/repo/jobs.js";
import type { RawJob } from "../../src/core/types.js";

const config: AppConfig = loadConfig();

const raw = (over: Partial<RawJob> = {}): RawJob => ({
  source: "remotive",
  url: `https://exemplo.com/vaga/${ulid()}`,
  title: "Analista de QA Júnior",
  companyName: "ACME",
  language: "en",
  ...over,
});

/** Cria uma vaga já pontuada, como o pipeline de busca deixaria. */
function seedScored(over: Partial<RawJob> = {}): string {
  const job = insertJob(raw(over))!;
  scoreNewJobs(config, [job.id]);
  return job.id;
}

function seedApplication(jobId: string): void {
  getDb()
    .prepare(
      `INSERT INTO applications (id, job_id, status, created_at, updated_at)
       VALUES (?, ?, 'applied', ?, ?)`
    )
    .run(ulid(), jobId, nowIso(), nowIso());
}

beforeEach(() => resetDb());

describe("rescore — guarda: escopo do que pode ser repontuado", () => {
  it("vaga com candidatura registrada NÃO é repontuada", () => {
    // O filtro tem que ser por `applications`, não por `jobs.status`: kit_ready e
    // applied vivem em applications, e em jobs a vaga continua marcada 'queued'.
    const id = seedScored();
    const antes = getJob(id)!;
    assert.equal(antes.status, "queued", "pré-condição: a vaga está na fila");
    seedApplication(id);

    const plan = rescoreAll(config, { commit: true });

    assert.equal(plan.scanned, 0, "nenhuma vaga elegível");
    const depois = getJob(id)!;
    assert.equal(depois.score, antes.score);
    assert.equal(depois.score_rescored_at, null, "não foi tocada");
  });

  it("vaga rejeitada tem o SCORE atualizado mas NÃO volta para a fila", () => {
    // Rejeição é decisão do operador. Repontuar não pode desfazê-la pelas costas.
    const id = seedScored();
    setJobStatus(id, "rejected");

    const plan = rescoreAll(config, { commit: true });

    assert.equal(plan.scanned, 1);
    const depois = getJob(id)!;
    assert.equal(depois.status, "rejected", "a rejeição do operador é preservada");
    assert.ok(depois.score_rescored_at, "mas o score foi recalculado");
    assert.equal(plan.entering.length, 0);
  });
});

describe("rescore — guarda: --dry-run não escreve", () => {
  it("o plano é calculado e o banco permanece byte a byte igual", () => {
    const id = seedScored();
    const antes = getJob(id)!;
    const eventosAntes = countEvents();

    const plan = rescoreAll(config); // sem commit — o default

    assert.equal(plan.committed, false);
    assert.equal(plan.scanned, 1, "planejou a vaga");
    const depois = getJob(id)!;
    assert.equal(depois.score, antes.score);
    assert.equal(depois.status, antes.status);
    assert.equal(depois.score_previous, null);
    assert.equal(depois.score_rescored_at, null);
    assert.equal(countEvents(), eventosAntes, "nem evento de policy o dry-run grava");
  });

  it("o policy engine não polui `events` nem no --commit", () => {
    // 375 vagas repontuadas não são 375 decisões de política tomadas.
    seedScored();
    seedScored({ title: "Product Owner Júnior" });
    const antes = countEvents();

    rescoreAll(config, { commit: true });

    assert.equal(countEvents(), antes);
  });
});

describe("rescore — guarda: proveniência e idempotência", () => {
  it("score_previous guarda o score ORIGINAL e sobrevive a repontuações repetidas", () => {
    const id = seedScored();
    const original = getJob(id)!.score;

    rescoreAll(config, { commit: true });
    const r1 = getJob(id)!;
    assert.equal(r1.score_previous, original, "1ª repontuação captura o marco zero");

    rescoreAll(config, { commit: true });
    const r2 = getJob(id)!;
    assert.equal(r2.score_previous, original, "a 2ª NÃO sobrescreve o marco zero");
    assert.equal(r2.score, r1.score, "e produz exatamente o mesmo score");
    assert.equal(r2.status, r1.status);
  });

  it("rodar duas vezes dá o mesmo plano", () => {
    seedScored();
    seedScored({ title: "Scrum Master", companyName: "Globex" });

    const a = rescoreAll(config, { commit: true });
    const b = rescoreAll(config, { commit: true });

    assert.deepEqual(
      b.all.map((c) => [c.jobId, c.scoreAfter, c.statusAfter]),
      a.all.map((c) => [c.jobId, c.scoreAfter, c.statusAfter])
    );
    assert.equal(b.changed.length, 0, "a 2ª rodada não muda nada");
  });
});

describe("rescore — guarda: filtros duros do config ATUAL são reaplicados", () => {
  it("vaga na fila que hoje bate um filtro de título sai da fila com o motivo", () => {
    // Este é o valor prático do comando: o config muda (exclude_title_keywords
    // entrou depois de centenas de inserts) e o acervo antigo nunca foi reavaliado.
    const id = seedScored({ title: "Analista de QA Júnior Noturno" });
    assert.equal(getJob(id)!.status, "queued", "pré-condição: entrou na fila");

    const cfg: AppConfig = {
      ...config,
      filters: { ...config.filters, exclude_title_keywords: ["noturno"] },
    };
    const plan = rescoreAll(cfg, { commit: true });

    assert.equal(plan.leaving.length, 1);
    const depois = getJob(id)!;
    assert.equal(depois.status, "new");
    assert.match(depois.policy_action!, /filtrado: título contém "noturno"/);
  });
});

function countEvents(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
}
