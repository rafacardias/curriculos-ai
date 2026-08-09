import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "../helpers/sandbox.js";
import { tokenize, extractKeywords, termsPresent } from "../../src/core/keywords.js";
import { coverageReport, renderCoverageMd } from "../../src/core/coverage.js";

describe("tokenize", () => {
  it("descarta stopwords PT e EN e tokens de até 2 chars", () => {
    assert.deepEqual(tokenize("A vaga é para o time de QA"), ["time"]);
    assert.deepEqual(tokenize("the job is for our team"), ["team"]);
  });

  it("normaliza acentos", () => {
    assert.ok(tokenize("automação de regressão").includes("automacao"));
    assert.ok(tokenize("automação de regressão").includes("regressao"));
  });
});

describe("extractKeywords", () => {
  it("bigrama pesa 2× o unigrama", () => {
    const kws = extractKeywords("quality assurance quality assurance", 10);
    const bi = kws.find((k) => k.term === "quality assurance");
    const uni = kws.find((k) => k.term === "quality");
    assert.ok(bi, "o bigrama deve ser extraído");
    assert.ok(uni);
    assert.equal(uni!.count, 2);
    assert.equal(bi!.count, 4); // 2 ocorrências × peso 2
    assert.ok(bi!.count > uni!.count);
  });

  it("respeita o top N e ordena por contagem", () => {
    const kws = extractKeywords("alfa beta gama delta epsilon zeta", 3);
    assert.equal(kws.length, 3);
    for (let i = 1; i < kws.length; i++) {
      assert.ok(kws[i - 1]!.count >= kws[i]!.count);
    }
  });

  it("é determinístico", () => {
    const t = "teste de regressão com Playwright e automação de API";
    assert.deepEqual(extractKeywords(t, 10), extractKeywords(t, 10));
  });

  it("REQ-002/LMG: termo composto de 4 tokens não gera bigramas encadeados sobrepostos", () => {
    // Achado real (KNOWN-BUGS.md): "Model Context Protocols (MCPs)" virava 4
    // "keywords" via bigrama de stride 1 — model+context, context+protocols,
    // protocols+mcps — o token do meio (context, protocols) contado duas vezes
    // como bigrama além de uma vez como unigrama. Com stride 2, "context
    // protocols" (o par do meio, sobreposto) não deve existir mais.
    const kws = extractKeywords("Requisito: experiência com Model Context Protocols (MCPs) obrigatória", 40);
    const terms = kws.map((k) => k.term);
    assert.ok(!terms.includes("context protocols"), "bigrama sobreposto do meio não deveria existir");
    assert.ok(terms.includes("model context"), "bigrama âncora do início continua");
    assert.ok(terms.includes("protocols mcps"), "bigrama âncora seguinte continua");
    // unigramas continuam existindo — coexistência de escala é intencional.
    assert.ok(terms.includes("model") && terms.includes("context") && terms.includes("protocols"));
  });
});

describe("termsPresent", () => {
  it("casa por palavra inteira, não por substring", () => {
    assert.deepEqual(termsPresent("trabalho com api rest", ["api"]), ["api"]);
    assert.deepEqual(termsPresent("rapidez e capital", ["api"]), []);
  });

  it("casa termos multi-palavra adjacentes", () => {
    assert.deepEqual(termsPresent("atuo com quality assurance diário", ["quality assurance"]), [
      "quality assurance",
    ]);
    assert.deepEqual(termsPresent("quality e depois assurance", ["quality assurance"]), []);
  });
});

describe("coverageReport", () => {
  it("cobertura total dá 100% e ATS heurístico 100", () => {
    const r = coverageReport("playwright automação", "playwright automação", 30);
    assert.equal(r.coveragePct, 100);
    assert.equal(r.atsScoreHeuristic, 100);
    assert.deepEqual(r.missing, []);
  });

  it("a fórmula do ATS score é coveragePct × 0.8 + 20 — piso de 20 com 0% de cobertura", () => {
    // Rotulado como estimativa no próprio relatório. O artefato honesto é covered/missing.
    const r = coverageReport("playwright cypress selenium", "nada em comum aqui", 30);
    assert.equal(r.coveragePct, 0);
    assert.equal(r.atsScoreHeuristic, 20);
  });

  it("JD vazio não divide por zero", () => {
    const r = coverageReport("", "qualquer coisa", 30);
    assert.equal(r.coveragePct, 0);
    assert.deepEqual(r.jdKeywords, []);
  });

  it("covered e missing particionam jdKeywords", () => {
    const r = coverageReport("playwright cypress automação de testes", "usei playwright em testes", 30);
    assert.equal(r.covered.length + r.missing.length, r.jdKeywords.length);
    assert.ok(r.covered.includes("playwright"));
    assert.ok(r.missing.includes("cypress"));
  });
});

describe("renderCoverageMd", () => {
  it("rotula o ATS score como estimativa heurística", () => {
    const md = renderCoverageMd(coverageReport("playwright", "playwright", 30));
    assert.match(md, /estimativa heurística/);
    assert.match(md, /nunca inventar/);
  });
});
