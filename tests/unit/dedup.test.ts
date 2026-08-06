import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "../helpers/sandbox.js"; // trava de sandbox
import {
  normalize,
  jobFingerprint,
  detectAtsPlatform,
  detectSeniority,
  detectRequiredYears,
} from "../../src/core/dedup.js";

describe("normalize", () => {
  it("remove acentos, caixa e pontuação", () => {
    assert.equal(normalize("Análise & Desenvolvimento"), "analise desenvolvimento");
    assert.equal(normalize("PL/SQL"), "pl sql");
    assert.equal(normalize("  Júnior  "), "junior");
  });
});

describe("jobFingerprint", () => {
  const base = { companyName: "ACME Software", title: "Analista de QA", location: "São Paulo" };

  it("é estável e tem 24 chars hex", () => {
    const fp = jobFingerprint(base);
    assert.match(fp, /^[0-9a-f]{24}$/);
    assert.equal(fp, jobFingerprint({ ...base }));
  });

  it("colide de propósito para a mesma vaga escrita de formas equivalentes", () => {
    // A URL não entra no hash: a mesma vaga vinda de duas fontes deve deduplicar.
    assert.equal(
      jobFingerprint(base),
      jobFingerprint({ companyName: "acme  software", title: "ANALISTA DE QA", location: "Sao Paulo!" })
    );
  });

  it("location ausente e location vazia produzem o mesmo fingerprint", () => {
    assert.equal(
      jobFingerprint({ companyName: "ACME", title: "QA" }),
      jobFingerprint({ companyName: "ACME", title: "QA", location: "" })
    );
  });

  it("BUG-001-adjacente: variação de título NÃO deduplica (dedup é hash exato)", () => {
    // Comportamento ATUAL congelado. A Onda 1 adiciona similaridade de título;
    // quando isso acontecer, ESTE TESTE DEVE FALHAR e ser invertido.
    assert.notEqual(
      jobFingerprint({ companyName: "ACME", title: "Analista QA Jr", location: "Remoto" }),
      jobFingerprint({ companyName: "ACME", title: "Analista de QA Júnior", location: "Remoto" })
    );
  });
});

describe("detectAtsPlatform", () => {
  const cases: Array<[string, string]> = [
    ["https://boards.greenhouse.io/acme/jobs/123", "greenhouse"],
    ["https://jobs.lever.co/acme/abc", "lever"],
    ["https://acme.wd1.myworkdayjobs.com/en-US/acme/job/x", "workday"],
    ["https://ficticia.gupy.io/job/abc", "gupy"],
    ["https://br.linkedin.com/jobs/view/123", "linkedin"],
    ["https://exemplo.com/carreiras/vaga", "other"],
  ];
  for (const [url, expected] of cases) {
    it(`${url} → ${expected}`, () => assert.equal(detectAtsPlatform(url), expected));
  }
});

describe("detectSeniority", () => {
  const cases: Array<[string, string | undefined]> = [
    ["Estágio em Quality Assurance", "intern"],
    ["Analista de QA Júnior", "junior"],
    ["QA Analyst Jr", "junior"],
    ["Analista de QA PL", "mid"],
    ["Analista de Testes II", "mid"],
    ["Senior QA Engineer", "senior"],
    ["Analista de Testes III", "senior"],
    ["Tech Lead de Qualidade", "lead"],
    ["Analista de QA", undefined],
  ];
  for (const [title, expected] of cases) {
    it(`"${title}" → ${expected}`, () => assert.equal(detectSeniority(title), expected));
  }

  it("exceção PL/SQL: é tecnologia, não senioridade pleno", () => {
    assert.equal(detectSeniority("PL/SQL Developer"), undefined);
    assert.equal(detectSeniority("Desenvolvedor PL SQL"), undefined);
  });

  it("Product/Project Manager é função IC, não liderança", () => {
    assert.equal(detectSeniority("Product Manager"), undefined);
    assert.equal(detectSeniority("Gerente de Projetos"), undefined);
    assert.equal(detectSeniority("Gerente de Vendas"), "leadership");
  });
});

describe("detectRequiredYears", () => {
  it("captura o requisito ancorado em experiência", () => {
    assert.equal(detectRequiredYears("Exigimos 8 anos de experiência com automação"), 8);
    assert.equal(detectRequiredYears("Requires 5 years of experience in QA"), 5);
    assert.equal(detectRequiredYears("Buscamos 3+ anos de experiencia"), 3);
  });

  it("num intervalo vale o mínimo", () => {
    assert.equal(detectRequiredYears("5-7 anos de experiência"), 5);
  });

  it("retorna o MAIOR requisito quando há vários", () => {
    assert.equal(detectRequiredYears("2 anos de experiência com QA e 6 anos de experiência com SQL"), 6);
  });

  it("não confunde idade da empresa com requisito", () => {
    assert.equal(detectRequiredYears("Somos uma empresa com 20 anos de mercado"), undefined);
    assert.equal(detectRequiredYears("Produto com 15 anos de história"), undefined);
  });

  it("ignora valores fora da faixa 1..30", () => {
    assert.equal(detectRequiredYears("0 anos de experiência"), undefined);
    assert.equal(detectRequiredYears("99 anos de experiência"), undefined);
  });
});
