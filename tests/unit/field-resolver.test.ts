/**
 * A cascata de preenchimento é o guardrail da submissão: resolveField retorna
 * null quando não sabe, e é esse null que faz o runner PAUSAR em vez de chutar
 * resposta num formulário real de candidatura (erro irreversível).
 *
 * Quando uma onda futura acrescentar heurística de detecção de campo, ela entra
 * como fonte ADICIONAL antes do null — nunca no lugar dele. Isto é o contrato.
 */
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb, runCli } from "../helpers/sandbox.js";
import { getDb, nowIso } from "../../src/db/client.js";
import { resolveField } from "../../src/submit/field-resolver.js";
import { loadMasterProfile } from "../../src/core/profile.js";
import type { MasterProfile } from "../../src/core/types.js";

let profile: MasterProfile;
before(() => {
  profile = loadMasterProfile();
});

/** Repopula profile_tracks e candidate_facts a partir dos YAMLs sintéticos. */
function seedProfile(): void {
  resetDb();
  const r = runCli("src/cli/ingest-profile.ts", ["sync"]);
  assert.equal(r.status, 0, `ingest-profile falhou: ${r.stderr}`);
}

describe("resolveField — cascata", () => {
  beforeEach(seedProfile);

  it("candidate_fact responde autorização de trabalho", () => {
    const r = resolveField("Are you legally authorized to work?", profile, "en");
    assert.equal(r?.source, "candidate_fact");
    assert.match(r!.value, /autorizada a trabalhar/);
  });

  it("pretensão salarial escolhe a moeda pelo idioma", () => {
    const r = resolveField("Qual sua pretensão salarial?", profile, "pt");
    assert.equal(r?.source, "candidate_fact");
    assert.match(r!.value, /R\$/);
  });

  it("identidade responde nome, email e linkedin", () => {
    assert.equal(resolveField("Full name", profile, "en")?.value, "Ana Teste");
    assert.equal(resolveField("First name", profile, "en")?.value, "Ana");
    assert.equal(resolveField("Email", profile, "en")?.value, "ana.teste@example.com");
    assert.equal(resolveField("LinkedIn", profile, "en")?.source, "identity");
  });

  it("candidate_facts têm precedência sobre identidade em pergunta de triagem", () => {
    const r = resolveField("Are you open to remote work?", profile, "en");
    assert.equal(r?.source, "candidate_fact");
  });

  it("label curto de cidade cai em identidade", () => {
    assert.equal(resolveField("Cidade", profile, "pt")?.source, "identity");
  });

  it("answer_bank responde pergunta aberta já salva e incrementa times_used", () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO answer_bank (id, question_fingerprint, question_text, answer, language, times_used, created_at, updated_at)
       VALUES ('ab1', 'por que voce quer trabalhar aqui', 'Por que você quer trabalhar aqui?', 'Porque X.', 'pt', 0, ?, ?)`
    ).run(nowIso(), nowIso());

    const r = resolveField("Por que você quer trabalhar aqui?", profile, "pt");
    assert.equal(r?.source, "answer_bank");
    assert.equal(r!.value, "Porque X.");

    const row = db.prepare("SELECT times_used FROM answer_bank WHERE id = 'ab1'").get() as {
      times_used: number;
    };
    assert.equal(row.times_used, 1, "o uso precisa ser contabilizado");
  });

  it("CONTRATO: pergunta desconhecida retorna null — o sistema pausa, nunca chuta", () => {
    assert.equal(resolveField("Quantos pinguins cabem num fusca?", profile, "pt"), null);
    assert.equal(resolveField("Describe your worst failure in 500 words", profile, "en"), null);
  });

  it("padrão de fact que casa mas não tem valor salvo também retorna null", () => {
    getDb().prepare("DELETE FROM candidate_facts WHERE key = 'work_authorization'").run();
    assert.equal(resolveField("Are you legally authorized to work?", profile, "en"), null);
  });
});
