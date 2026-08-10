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
import { decideLearning, parseReasonClass, REASON_CLASSES, isLearnedKey } from "../../src/core/feedback.js";
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
    assert.equal(pesos()["company:acme"], -1);
  });

  it("`source:*` NUNCA é escrito — a fonte é canal, não preferência", () => {
    // Item 3 do BUG-007. Rejeitar uma vaga do LinkedIn pelo TEMA dela não diz
    // nada sobre o LinkedIn; 11 das 16 vagas da fila vêm de lá. Este teste
    // substituiu um que assertava exatamente o contrário — era o comportamento
    // que o bug produzia.
    const job = getJob(insertJob(raw())!.id)!;
    applyFeedback({ job, verdict: "rejeitar", reasonClass: "tema", via: "test" });
    for (const k of Object.keys(pesos())) {
      assert.ok(!k.startsWith("source:"), `chave de fonte vazou: ${k}`);
    }
  });

  it("o scorer também IGNORA `source:*` — remoção na leitura, não só na escrita", () => {
    // As chaves antigas continuam na tabela. Sem o filtro na leitura, elas
    // voltariam a pontuar no dia em que `scoring.preference` fosse religado.
    assert.equal(isLearnedKey("source:linkedin"), false);
    assert.equal(isLearnedKey("source:gupy"), false);
    assert.equal(isLearnedKey("kw:n8n"), true);
    assert.equal(isLearnedKey("company:acme"), true);
    assert.equal(isLearnedKey("seniority:junior"), true);
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
    assert.deepEqual(k, preferenceKeysFor(job), "determinística");
  });
});

describe("preferenceKeysFor — ORDER BY e `enabled` ausentes (mesma classe do BUG-010)", () => {
  // KNOWN-BUGS.md, varredura de 2026-08-09: candidato registrado, dívida sem
  // sangramento (componente `preference` desarmado). `feedback.ts:39` fazia
  // `SELECT keywords FROM profile_tracks` sem `ORDER BY` e sem `WHERE enabled = 1`
  // — QUAIS das >8 keywords batidas sobrevivem ao `.slice(0, 8)` dependia da
  // ordem de leitura da tabela, e uma trilha desativada continuava contribuindo.
  beforeEach(() => resetDb());

  function seedTrack(id: string, keywords: string[], enabled = 1): void {
    getDb()
      .prepare(
        "INSERT INTO profile_tracks (id, name, keywords, updated_at, enabled) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, id, JSON.stringify(keywords), "2026-08-10T00:00:00Z", enabled);
  }

  it("o desempate por >8 keywords batidas segue `id ASC`, não a ordem de inserção", () => {
    // "zzz" inserida ANTES de "aaa" — insertion order (rowid) é zzz→aaa;
    // ordem alfabética por id é aaa→zzz. Se o slice(0,8) seguir rowid (bug),
    // as 5 de zzz entram inteiras e só 3 de aaa sobram. Se seguir `id ASC`
    // (fix), é o oposto: as 5 de aaa entram inteiras e só 3 de zzz sobram.
    seedTrack("zzz", ["kwz1", "kwz2", "kwz3", "kwz4", "kwz5"]);
    seedTrack("aaa", ["kwa1", "kwa2", "kwa3", "kwa4", "kwa5"]);
    const job = getJob(
      insertJob(
        raw({
          title: "Vaga genérica",
          description: "kwz1 kwz2 kwz3 kwz4 kwz5 kwa1 kwa2 kwa3 kwa4 kwa5",
        })
      )!.id
    )!;
    const keys = preferenceKeysFor(job);
    for (const kw of ["kwa1", "kwa2", "kwa3", "kwa4", "kwa5"]) {
      assert.ok(keys.includes(`kw:${kw}`), `${kw} (trilha "aaa", id ASC vence) deveria sobreviver ao slice`);
    }
    for (const kw of ["kwz4", "kwz5"]) {
      assert.ok(!keys.includes(`kw:${kw}`), `${kw} deveria ter sido cortado pelo slice(0, 8)`);
    }
  });

  it("trilha desativada não contribui keyword nenhuma", () => {
    seedTrack("ativa", ["kwviva"], 1);
    seedTrack("desativada", ["kwmorta"], 0);
    const job = getJob(insertJob(raw({ title: "kwviva kwmorta", description: "" }))!.id)!;
    const keys = preferenceKeysFor(job);
    assert.ok(keys.includes("kw:kwviva"));
    assert.ok(!keys.includes("kw:kwmorta"), "trilha desabilitada não pode alimentar preference_weights");
  });
});
