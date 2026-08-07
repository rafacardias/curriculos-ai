/**
 * Uma definição de "aplicada", uma de "na fila".
 *
 * O estado que originou isto, na mesma tela: card do topo "1 APLICADAS",
 * coluna do kanban "APPLIED 0", painel "Aplicadas 0" e painel "Por fonte /
 * linkedin / 1 aplicação". O "1" era a Freedom24 — RETIRADA por exigir russo
 * nativo. E "na fila" dizia 20 no card contra 11 na lista, porque o card não
 * excluía as 9 vagas que já tinham virado kit.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { funnelCounts, APLICADAS } from "../../src/core/funnel.js";
import { insertJob, setJobStatus } from "../../src/db/repo/jobs.js";
import { createApplication, setApplicationStatus } from "../../src/db/repo/applications.js";
import type { RawJob } from "../../src/core/types.js";

let n = 0;
const vagaNaFila = (): string => {
  const j = insertJob({
    source: "linkedin",
    url: `https://exemplo.com/vaga/${++n}`,
    title: `Vaga ${n}`,
    companyName: "ACME",
    language: "pt",
  } satisfies RawJob)!;
  setJobStatus(j.id, "queued");
  return j.id;
};

describe("funnelCounts", () => {
  beforeEach(() => {
    resetDb();
    n = 0;
  });

  it("vaga com kit sai de 'na fila' — não é contada duas vezes", () => {
    const a = vagaNaFila();
    vagaNaFila();
    assert.equal(funnelCounts().queued, 2);

    createApplication(a, null, "output/x", "manual");
    const f = funnelCounts();
    assert.equal(f.queued, 1, "a vaga que virou kit sai da fila");
    assert.equal(f.kitReady, 1);
    // O erro original era este: 2 + 1 = 3 "coisas" quando só existem 2 vagas.
    assert.equal(f.queued + f.kitReady, 2);
  });

  it("withdrawn NÃO é aplicada — é o caso Freedom24", () => {
    const j = vagaNaFila();
    const app = createApplication(j, null, "output/y", "manual");
    setApplicationStatus(app.id, "withdrawn");

    const f = funnelCounts();
    assert.equal(f.applied, 0, "desistir não é aplicar");
    assert.equal(f.withdrawn, 1, "mas também não some");
    assert.equal(f.kitReady, 0);
  });

  it("aplicada é cumulativa: quem chegou a entrevista já se candidatou", () => {
    // Sem isto, a taxa de resposta divide por um denominador que encolhe toda
    // vez que alguém avança — e melhora sozinha sem nada ter melhorado.
    const j = vagaNaFila();
    const app = createApplication(j, null, "output/z", "manual");
    setApplicationStatus(app.id, "interview");

    const f = funnelCounts();
    assert.equal(f.applied, 1);
    assert.equal(f.responded, 1);
    assert.equal(f.interviews, 1);
    assert.equal(f.offers, 0);
  });

  it("rejeitada pela empresa continua contando como candidatura enviada", () => {
    const j = vagaNaFila();
    const app = createApplication(j, null, "output/w", "manual");
    setApplicationStatus(app.id, "rejected");
    const f = funnelCounts();
    assert.equal(f.applied, 1, "foi enviada; o resultado é que foi negativo");
    assert.equal(f.rejected, 1);
  });

  it("kit_ready e submitting nunca entram em 'aplicada'", () => {
    assert.ok(!APLICADAS.includes("kit_ready"));
    assert.ok(!APLICADAS.includes("submitting"));
    assert.ok(!APLICADAS.includes("withdrawn"));
  });

  it("banco vazio devolve zeros, não undefined", () => {
    const f = funnelCounts();
    for (const [k, v] of Object.entries(f)) assert.equal(v, 0, `${k} deveria ser 0`);
  });
});
