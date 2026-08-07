/**
 * BUG-007 — o motivo passa a decidir se o score aprende.
 *
 * O caso real que originou isto: cinco rejeições cujo motivo o operador digitou
 * como "Hibridas em outras cidades" ensinaram ao sistema que ele não gosta de
 * `agentes de ia`, `vector database`, `openai`, `orquestração` e da fonte
 * `linkedin` — que é de onde vem a maior parte da fila dele. O motivo estava
 * gravado e era ignorado.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { decideLearning, parseReasonClass, REASON_CLASSES } from "../../src/core/feedback.js";
import { applyFeedback, hasLearnedFrom, preferenceKeysFor } from "../../src/db/repo/feedback.js";
import { insertJob, getJob } from "../../src/db/repo/jobs.js";
import { getDb } from "../../src/db/client.js";
import type { RawJob } from "../../src/core/types.js";

const raw = (over: Partial<RawJob> = {}): RawJob => ({
  source: "linkedin",
  url: "https://exemplo.com/vaga/fb",
  title: "AI Engineer",
  companyName: "ACME",
  description: "Trabalho com n8n, RAG e agentes de IA. Modelo híbrido em São Paulo.",
  language: "pt",
  ...over,
});

describe("decideLearning — só motivo temático move peso", () => {
  it("rejeição por elegibilidade NÃO aprende", () => {
    const d = decideLearning({ verdict: "rejeitar", reasonClass: "elegibilidade", alreadyLearned: false });
    assert.equal(d.learn, false);
    assert.equal(d.delta, 0);
    assert.match(d.why, /elegibilidade/);
  });

  it("rejeição temática aprende -1", () => {
    const d = decideLearning({ verdict: "rejeitar", reasonClass: "tema", alreadyLearned: false });
    assert.equal(d.learn, true);
    assert.equal(d.delta, -1);
  });

  it("classe ausente NÃO aprende — silêncio não é autorização", () => {
    // Um chamador antigo que não mande a classe não ganha permissão por omissão.
    for (const c of [null, undefined]) {
      const d = decideLearning({ verdict: "rejeitar", reasonClass: c, alreadyLearned: false });
      assert.equal(d.learn, false, `classe ${String(c)} não pode aprender`);
    }
  });

  it("classe inventada não vira classe válida", () => {
    assert.equal(parseReasonClass("temático"), null);
    assert.equal(parseReasonClass(""), null);
    assert.equal(parseReasonClass("TEMA"), "tema");
  });

  it("aprovação aprende +1, mas só uma vez por vaga", () => {
    assert.equal(decideLearning({ verdict: "aprovar", alreadyLearned: false }).delta, 1);
    // Retry de vaga que falhou na geração: sete cliques não são sete aprovações.
    assert.equal(decideLearning({ verdict: "aprovar", alreadyLearned: true }).learn, false);
  });

  it("exatamente uma classe é declarada como aprendente", () => {
    assert.deepEqual(REASON_CLASSES.filter((c) => c.learns).map((c) => c.id), ["tema"]);
  });
});

describe("applyFeedback — o efeito no banco", () => {
  beforeEach(() => resetDb());

  const pesos = () =>
    Object.fromEntries(
      (getDb().prepare("SELECT key, weight FROM preference_weights").all() as Array<{ key: string; weight: number }>)
        .map((r) => [r.key, r.weight] as const)
    );

  it("rejeição por elegibilidade não escreve peso nenhum, mas registra o evento", () => {
    const job = getJob(insertJob(raw())!.id)!;
    const { decision, keys } = applyFeedback({
      job,
      verdict: "rejeitar",
      reasonClass: "elegibilidade",
      reason: "híbrida em São Paulo",
      via: "test",
    });
    assert.equal(decision.learn, false);
    assert.deepEqual(keys, []);
    assert.deepEqual(pesos(), {}, "nenhuma chave pode ter sido criada");

    // O evento existe e é auditável quanto à classe — 2º requisito para religar.
    const ev = getDb().prepare("SELECT payload FROM events WHERE entity_id = ?").get(job.id) as { payload: string };
    const p = JSON.parse(ev.payload);
    assert.equal(p.reason_class, "elegibilidade");
    assert.equal(p.learned, false);
    assert.equal(p.reason, "híbrida em São Paulo");
    // E a vaga saiu da fila do mesmo jeito: não aprender ≠ não decidir.
    assert.equal(getJob(job.id)!.status, "rejected");
  });

  it("rejeição temática escreve -1 nas chaves da vaga", () => {
    const job = getJob(insertJob(raw())!.id)!;
    applyFeedback({ job, verdict: "rejeitar", reasonClass: "tema", via: "test" });
    const p = pesos();
    assert.equal(p["company:acme"], -1);
    assert.equal(p["source:linkedin"], -1);
  });

  it("dois cliques em Aplicar na mesma vaga contam UMA aprovação", () => {
    // É o caso do retry: a geração falhou por limite de sessão, a vaga voltou à
    // fila e o operador clicou de novo.
    const job = getJob(insertJob(raw())!.id)!;
    applyFeedback({ job, verdict: "aprovar", via: "test" });
    const depoisDoPrimeiro = pesos();
    const segundo = applyFeedback({ job, verdict: "aprovar", via: "test" });
    assert.equal(segundo.decision.learn, false);
    assert.deepEqual(pesos(), depoisDoPrimeiro, "o segundo clique não pode mover nada");
  });

  it("uma rejeição que não aprendeu não bloqueia uma rejeição temática depois", () => {
    const job = getJob(insertJob(raw())!.id)!;
    applyFeedback({ job, verdict: "rejeitar", reasonClass: "elegibilidade", via: "test" });
    assert.equal(hasLearnedFrom(job.id, "rejeitar"), false);
    const segunda = applyFeedback({ job, verdict: "rejeitar", reasonClass: "tema", via: "test" });
    assert.equal(segunda.decision.learn, true);
  });

  it("evento legado (sem `learned`, com `keys`) conta como aprendizado já ocorrido", () => {
    // Senão o primeiro clique pós-correção somaria em cima do que já estava lá.
    const job = getJob(insertJob(raw())!.id)!;
    getDb()
      .prepare("INSERT INTO events (id, entity, entity_id, type, payload, created_at) VALUES (?, 'job', ?, 'feedback_approve', ?, ?)")
      .run("ev-legado", job.id, JSON.stringify({ reason: null, keys: ["company:acme"] }), "2026-08-01T00:00:00Z");
    assert.equal(hasLearnedFrom(job.id, "aprovar"), true);
    assert.equal(applyFeedback({ job, verdict: "aprovar", via: "test" }).decision.learn, false);
  });

  it("as chaves são as mesmas que o reparo reconstrói", () => {
    // O estorno de 2026-08-07 depende disto: recalcular por outro caminho erraria
    // o alvo. Congelado para que a função não possa divergir de si mesma.
    const job = getJob(insertJob(raw())!.id)!;
    const k = preferenceKeysFor(job);
    assert.ok(k.includes("company:acme"));
    assert.ok(k.includes("source:linkedin"));
    assert.deepEqual(k, preferenceKeysFor(job), "determinística");
  });
});
