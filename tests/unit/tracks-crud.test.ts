import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../helpers/sandbox.js";
import { resetDb } from "../helpers/sandbox.js";
import { listTracks, getTrack, createTrack, updateTrack } from "../../src/db/repo/profile-tracks.js";

beforeEach(() => resetDb());

describe("createTrack", () => {
  it("cria com enabled=1 por padrão", () => {
    const t = createTrack({ id: "produtos", name: "Produtos", keywords: ["pm", "po"] });
    assert.equal(t.id, "produtos");
    assert.equal(t.enabled, 1);
    assert.deepEqual(JSON.parse(t.keywords), ["pm", "po"]);
  });

  it("recusa id fora do formato (minúsculas, números, hífen)", () => {
    assert.throws(() => createTrack({ id: "Produtos PM", name: "x", keywords: [] }), /id de trilha inválido/);
    assert.throws(() => createTrack({ id: "produtos_pm", name: "x", keywords: [] }), /id de trilha inválido/);
  });

  it("recusa id duplicado", () => {
    createTrack({ id: "qa", name: "QA", keywords: [] });
    assert.throws(() => createTrack({ id: "qa", name: "QA de novo", keywords: [] }), /já existe/);
  });
});

describe("updateTrack", () => {
  it("atualiza name/summary/keywords sem tocar id", () => {
    createTrack({ id: "qa", name: "QA", keywords: ["testes"] });
    const updated = updateTrack("qa", { name: "Quality Assurance", keywords: ["testes", "automação"] });
    assert.equal(updated.id, "qa");
    assert.equal(updated.name, "Quality Assurance");
    assert.deepEqual(JSON.parse(updated.keywords), ["testes", "automação"]);
  });

  it("desativa via enabled:false — soft-disable, não DELETE", () => {
    createTrack({ id: "qa", name: "QA", keywords: [] });
    const disabled = updateTrack("qa", { enabled: false });
    assert.equal(disabled.enabled, 0);
    assert.ok(getTrack("qa"), "a linha continua existindo");
  });

  it("não existe função de update que aceite 'id' no patch — a assinatura não permite", () => {
    // Documentado em código: `updateTrack(id, patch)` — patch não tem campo `id`.
    // Este teste é o contrato: se algum dia `id` for adicionado ao patch, ele
    // precisa vir com uma decisão explícita sobre órfãos em `jobs.track_hint`.
    createTrack({ id: "qa", name: "QA", keywords: [] });
    const updated = updateTrack("qa", { name: "Renomeado" } as Parameters<typeof updateTrack>[1]);
    assert.equal(updated.id, "qa");
  });

  it("lança para trilha inexistente", () => {
    assert.throws(() => updateTrack("nao-existe", { name: "x" }), /não existe/);
  });
});

describe("listTracks", () => {
  it("onlyEnabled filtra as desativadas", () => {
    createTrack({ id: "qa", name: "QA", keywords: [] });
    createTrack({ id: "product", name: "Produtos", keywords: [] });
    updateTrack("product", { enabled: false });

    assert.equal(listTracks().length, 2);
    const enabled = listTracks({ onlyEnabled: true });
    assert.equal(enabled.length, 1);
    assert.equal(enabled[0]!.id, "qa");
  });

  it("ordena por id", () => {
    createTrack({ id: "zeta", name: "Z", keywords: [] });
    createTrack({ id: "alfa", name: "A", keywords: [] });
    assert.deepEqual(listTracks().map((t) => t.id), ["alfa", "zeta"]);
  });
});
