/**
 * O truthcheck é a REGRA Nº 1 do sistema em forma de código.
 * Estes testes existem para que nenhuma onda futura o enfraqueça sem perceber.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../helpers/sandbox.js";
import { truthcheck, stripCitations } from "../../src/core/truthcheck.js";
import { loadMasterProfile } from "../../src/core/profile.js";

const profile = loadMasterProfile(); // perfil sintético da sandbox
const fixture = (name: string) => readFileSync(join(REPO_ROOT, "tests/fixtures/kit", name), "utf-8");

describe("truthcheck", () => {
  it("aprova currículo cujos bullets citam fatos existentes", () => {
    const r = truthcheck(fixture("resume.ok.md"), profile);
    assert.equal(r.ok, true);
    assert.deepEqual(r.invalid, []);
    assert.deepEqual(r.uncitedBullets, []);
    assert.equal(r.citations.length, 5);
  });

  it("reprova citação a fato inexistente", () => {
    const r = truthcheck(fixture("resume.bad-citation.md"), profile);
    assert.equal(r.ok, false);
    assert.deepEqual(r.invalid, ["fato-que-nao-existe"]);
  });

  it("reprova bullet sem citação quando ele está DIRETO sob '## Experiência'", () => {
    const md = "## Experiência Profissional\n\n- Inventei uma métrica que não existe\n";
    const r = truthcheck(md, profile);
    assert.equal(r.ok, false);
    assert.equal(r.uncitedBullets.length, 1);
  });

  it("BUG-005 CORRIGIDO: bullet sem citação sob '### Cargo — Empresa' é pego", () => {
    // Era o buraco: o subheading de cargo desligava a checagem e todos os bullets
    // reais do currículo escapavam. Agora a seção é delimitada por nível de heading.
    const r = truthcheck(fixture("resume.uncited-bullet.md"), profile);
    assert.equal(r.ok, false);
    assert.equal(r.uncitedBullets.length, 1);
    assert.match(r.uncitedBullets[0]!, /reescrever o pipeline de CI/);
  });

  it("BUG-005: no formato EXATO que a skill /gerar prescreve, o bullet sem lastro falha", () => {
    // Reproduz .claude/skills/gerar/SKILL.md:51-54 literalmente — é o formato que
    // o sistema realmente produz, e era justamente o que passava batido.
    const md = [
      "## Experiência Profissional",
      "### Analista de QA — ACME Software",
      "2023-01 – 2025-06",
      "",
      "- Estruturei a suíte de regressão do checkout [exp:exp-acme-qa.f1]",
      "- Liderei um time de 8 pessoas e dobrei a receita da unidade",
      "",
      "### Analista de Suporte Técnico — Globex",
      "2021-03 – 2022-12",
      "",
      "- Atendi 120 chamados por mês [exp:exp-globex-suporte.f1]",
      "",
    ].join("\n");

    const r = truthcheck(md, profile);
    assert.equal(r.ok, false, "bullet inventado sem citação tem que reprovar");
    assert.equal(r.uncitedBullets.length, 1);
    assert.match(r.uncitedBullets[0]!, /Liderei um time de 8 pessoas/);
  });

  it("a seção de experiência termina no próximo heading de mesmo nível", () => {
    const md = [
      "## Experiência Profissional",
      "### Analista de QA — ACME",
      "- com citação [exp:exp-acme-qa.f1]",
      "## Skills",
      "- Playwright",
      "- SQL",
      "",
    ].join("\n");
    assert.deepEqual(truthcheck(md, profile).uncitedBullets, [], "bullets de Skills não exigem citação");
  });

  it("heading de nível superior também encerra a seção", () => {
    const md = [
      "## Experiência Profissional",
      "### Cargo — Empresa",
      "- citado [exp:exp-acme-qa.f1]",
      "# Outro Documento",
      "- solto sem citação",
      "",
    ].join("\n");
    assert.deepEqual(truthcheck(md, profile).uncitedBullets, []);
  });

  it("aceita tanto o id da experiência quanto o id do fato", () => {
    const md = "## Experiência\n- Fiz coisa [exp:exp-acme-qa]\n- Fiz outra [exp:exp-acme-qa.f2]\n";
    assert.equal(truthcheck(md, profile).ok, true);
  });

  it("bullets citados consecutivos não são falsos positivos (regex /g é stateful)", () => {
    // CITATION_RE é global: sem o reset de lastIndex, o 2º bullet seria acusado
    // de não citar. Este teste congela a proteção.
    const md = [
      "## Experiência Profissional",
      "- um [exp:exp-acme-qa.f1]",
      "- dois [exp:exp-acme-qa.f2]",
      "- três [exp:exp-acme-qa.f3]",
      "",
    ].join("\n");
    assert.deepEqual(truthcheck(md, profile).uncitedBullets, []);
  });

  it("bullets fora da seção de experiência não exigem citação", () => {
    const md = "## Skills\n- Playwright\n- SQL\n";
    assert.equal(truthcheck(md, profile).ok, true);
  });
});

describe("stripCitations", () => {
  it("remove as tags e o espaço que as precede", () => {
    assert.equal(stripCitations("- Fiz X [exp:exp-acme-qa.f1]"), "- Fiz X");
  });

  it("nenhuma tag sobrevive ao strip do currículo válido", () => {
    assert.doesNotMatch(stripCitations(fixture("resume.ok.md")), /\[exp:/);
  });
});
