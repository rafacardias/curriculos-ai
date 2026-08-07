/**
 * Segmentação por seção — o eixo certo, depois de três aparições do REQ-002.
 *
 * O caso nomeado é a 10x Advisory (score 82), e ele precisa funcionar NOS DOIS
 * SENTIDOS: a menção sob *Responsibilities* tem que filtrar, e a menção sob
 * *Preferred Qualifications* tem que não filtrar. Um segmentador que só faz uma
 * das duas trocou um erro por outro.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { segmentJd, sectionAt, matchesInSections } from "../../src/core/jd-sections.js";
import { loadConfig, type AppConfig } from "../../src/core/config.js";
import { blockingTechnology, requiredYears, hardFilterReason } from "../../src/core/scoring.js";
import { insertJob, getJob } from "../../src/db/repo/jobs.js";
import type { RawJob } from "../../src/core/types.js";

/**
 * Reprodução fiel da ESTRUTURA do JD da 10x Advisory, com texto reescrito.
 * O anúncio real não entra no repo — `output/` é dado pessoal e `tests/` é
 * público. O que precisa ser idêntico é o formato: cabeçalhos achatados, sem
 * pontuação antes, exatamente como o `stripHtml` os entrega.
 */
const JD_ESTILO_10X = [
  "Build the Next Generation of Enterprise AI",
  "Our client is building a high-growth practice for enterprise customers.",
  "Responsibilities",
  "Integrate AI capabilities with APIs, cloud services, and enterprise applications",
  "Develop scalable backend services using Python and modern application frameworks",
  "Partner with solution architects and consultants",
  "Qualifications",
  "We are looking for professionals with hands-on experience building modern AI applications.",
  "Ideal candidates will have experience with many of the following:",
  "REST APIs Git Docker Generative AI OpenAI Azure OpenAI Anthropic",
  "Preferred Qualifications",
  "3+ years of professional software engineering experience",
  "Experience building production applications using Python",
  "Strong understanding of distributed systems",
].join(" ");

describe("segmentJd", () => {
  it("reconhece cabeçalho ACHATADO, sem pontuação antes dele", () => {
    // "...Azure OpenAI Anthropic Preferred Qualifications 3+ years..." é como o
    // texto chega depois do stripHtml. A primeira versão do segmentador exigia
    // fronteira à esquerda e classificava tudo como Responsibilities.
    const secoes = segmentJd(JD_ESTILO_10X);
    const titulos = secoes.map((s) => s.heading);
    assert.ok(titulos.includes("Responsibilities"), `achou: ${JSON.stringify(titulos)}`);
    assert.ok(titulos.some((t) => t === "Preferred Qualifications"));
  });

  it("o cabeçalho mais longo vence o que está contido nele", () => {
    // "Preferred Qualifications" contém "Qualifications". Se o curto vencesse,
    // a seção preferencial viraria obrigatória.
    const s = segmentJd("Preferred Qualifications 3+ years of experience");
    assert.equal(s[0]!.heading, "Preferred Qualifications");
    assert.equal(s[0]!.weight, "weak");
  });

  it("prosa em minúscula NÃO abre seção", () => {
    // Sem a checagem de capitalização, qualquer frase que cite "requirements"
    // reclassificaria o resto do anúncio.
    const s = segmentJd("we have preferred qualifications but they are flexible");
    assert.deepEqual(s.map((x) => x.weight), ["neutral"]);
  });

  it("texto sem cabeçalho nenhum é uma seção neutral — nunca 'weak' por omissão", () => {
    // Tratar "não reconheci" como "é preferencial" seria a CLASSE-01 forma A
    // dentro da correção da forma B.
    const s = segmentJd("Vaga de analista. Trabalhamos com Python e SQL no dia a dia.");
    assert.equal(s.length, 1);
    assert.equal(s[0]!.weight, "neutral");
  });

  it("sectionAt devolve a seção que contém o índice", () => {
    const secoes = segmentJd(JD_ESTILO_10X);
    const i = JD_ESTILO_10X.indexOf("3+ years");
    assert.equal(sectionAt(secoes, i).heading, "Preferred Qualifications");
  });

  it("matchesInSections devolve cada ocorrência com a seção dela", () => {
    const ms = matchesInSections(JD_ESTILO_10X, /\bPython\b/g);
    assert.equal(ms.length, 2);
    assert.equal(ms[0]!.section.weight, "obligation"); // Responsibilities
    assert.equal(ms[1]!.section.weight, "weak"); // Preferred Qualifications
  });
});

describe("10x Advisory — o caso nomeado, nos dois sentidos", () => {
  let config: AppConfig;
  beforeEach(() => {
    resetDb();
    config = loadConfig();
  });

  const vaga = (descricao: string, over: Partial<RawJob> = {}) =>
    getJob(
      insertJob({
        source: "linkedin",
        url: `https://exemplo.com/${Math.random().toString(36).slice(2)}`,
        title: "AI Engineer",
        companyName: "Exemplo",
        description: descricao,
        language: "en",
        ...over,
      } as RawJob)!.id
    )!;

  it("SENTIDO 1 — Python sob Responsibilities FILTRA, sem marcador de obrigatoriedade nenhum", () => {
    // "Develop scalable backend services using Python": construir o backend em
    // Python é a descrição do trabalho. Não há "required", não há "must have",
    // e não precisa haver — a seção já é o marcador.
    const j = vaga("Responsibilities Develop scalable backend services using Python and modern frameworks");
    assert.equal(blockingTechnology({ ...config, filters: { ...config.filters, blocking_technologies: ["python"] } }, j), "python");
  });

  it("SENTIDO 2 — Python sob Preferred Qualifications NÃO filtra", () => {
    // O próprio anúncio diz que é preferência. Filtrar aqui descartaria vaga boa.
    const j = vaga("Preferred Qualifications Experience building production applications using Python");
    assert.equal(blockingTechnology({ ...config, filters: { ...config.filters, blocking_technologies: ["python"] } }, j), null);
  });

  it("o JD inteiro filtra — a menção obrigatória vence a preferencial", () => {
    const j = vaga(JD_ESTILO_10X);
    const c = { ...config, filters: { ...config.filters, blocking_technologies: ["python"], max_years_required: 2 } };
    assert.match(hardFilterReason(c, j) ?? "", /exige python/);
  });

  it("'3+ years' sob Preferred NÃO dispara o teto de anos", () => {
    // Correção de premissa: no anúncio real, "3+ years of professional software
    // engineering experience" está sob *Preferred Qualifications*, não sob
    // Requirements. O teto de 2 anos não deve disparar por ele.
    const j = vaga(JD_ESTILO_10X);
    assert.equal(requiredYears(j), null);
  });
});

describe("anos exigidos — o segmentador separa requisito de idade da empresa", () => {
  beforeEach(() => resetDb());

  const comTexto = (descricao: string) =>
    getJob(
      insertJob({
        source: "gupy",
        url: `https://exemplo.com/${Math.random().toString(36).slice(2)}`,
        title: "Analista",
        companyName: "Exemplo",
        description: descricao,
        language: "pt",
      } as RawJob)!.id
    )!;

  it("'30 anos de atuação' sob 'Sobre nós' NÃO é requisito", () => {
    // Esta é a razão de não alargar o detector por tolerância de palavras: das 37
    // vagas acima do teto que o padrão largo encontrava, algumas eram a idade da
    // empresa. Trocar falso negativo por falso positivo é lateral.
    const j = comTexto("Sobre nós somos uma empresa com 30 anos de atuação no mercado. Requisitos conhecimento em Excel.");
    assert.equal(requiredYears(j), null);
  });

  it("'5 anos de experiência' adjacente continua valendo em qualquer seção", () => {
    // O detector estrito nunca dependeu de seção, e não passa a depender.
    assert.equal(requiredYears(comTexto("Requisitos 5 anos de experiência sólida em vendas.")), 5);
  });

  it("'N years of <palavras> experience' passa a valer DENTRO de seção obrigatória", () => {
    // O ganho: o padrão estrito exige adjacência e perdia isto.
    assert.equal(
      requiredYears(comTexto("Requirements 4 years of professional non-academic writing experience")),
      4
    );
  });

  it("a mesma frase FORA de seção reconhecida continua invisível — comportamento anterior", () => {
    assert.equal(requiredYears(comTexto("We are hiring. 4 years of professional writing experience helps.")), null);
  });
});
