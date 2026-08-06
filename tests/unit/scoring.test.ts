import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { loadConfig, type AppConfig } from "../../src/core/config.js";
import { scoreJob, scoreNewJobs } from "../../src/core/scoring.js";
import { insertJob, getJob } from "../../src/db/repo/jobs.js";
import type { RawJob } from "../../src/core/types.js";

let config: AppConfig;
before(() => {
  config = loadConfig();
});

const raw = (over: Partial<RawJob> = {}): RawJob => ({
  source: "remotive",
  url: "https://exemplo.com/vaga/1",
  title: "Qualquer Coisa",
  companyName: "ACME",
  language: "en",
  ...over,
});

describe("scoreJob — composição dos 5 componentes", () => {
  beforeEach(() => resetDb());

  it("BUG-002: o piso caiu de 41.5 para 39.5 e passou para BAIXO do queue_threshold 40", () => {
    // O teste congelado da Onda 0 assertava 41.5 e status 'queued'. Ele FALHOU ao
    // desarmarmos o `preference` (BUG-007), que é exatamente o que um teste
    // congelado existe para fazer: avisar que a aritmética mudou.
    //
    // Aritmética nova, com o fallback morto (scoring.ts → overlap = 0.3) intacto:
    //   keyword_overlap 0.3 × 0.65 × 100 = 19.5   (herdou o peso do preference)
    //   recency         0.5 × 0.15 × 100 =  7.5   (posted_at nulo → desconhecido, não velho)
    //   location_fit    0.5 × 0.15 × 100 =  7.5   (remote_type nulo, location nulo)
    //   language_fit    1.0 × 0.05 × 100 =  5.0   (en)
    //   preference      0   × 0    × 100 =  0.0   (componente desarmado)
    //                                     ------
    //                                       39.5  <  40
    //
    // O fallback morto NÃO foi corrigido — a vaga ainda ganha 19.5 pontos de
    // aderência sem nenhuma trilha no banco. O que mudou é que o total deixou de
    // passar o threshold, então ele parou de encher a fila sozinho. A margem é de
    // 0.5 ponto: qualquer recalibração de threshold (item 1.6) tem de considerar
    // que baixar `queue_threshold` para 39 ressuscita o BUG-002 inteiro.
    const job = insertJob(raw())!;
    const { score, detail } = scoreJob(config, getJob(job.id)!);

    assert.equal(detail.keyword_overlap, 19.5);
    assert.equal(detail.recency, 7.5);
    assert.equal(detail.location_fit, 7.5);
    assert.equal(detail.language_fit, 5);
    assert.equal(detail.preference, 0);
    assert.equal(score, 39.5);
    assert.ok(score < config.queue_threshold, "o piso agora fica abaixo do threshold");

    const [scored] = scoreNewJobs(config, [job.id]);
    assert.equal(scored!.status, "new", "vaga sem trilha não entra mais na fila sozinha");
  });

  it("recency_floor é piso, não teto: vaga fresca ainda pontua mais que vaga velha", () => {
    // A calibração não pode apagar a discriminação de 0–21 dias, que é a razão de
    // o componente existir.
    const hoje = insertJob(raw({ postedAt: new Date().toISOString() }))!;
    // Título diferente: o fingerprint é empresa+título+local, então repetir o
    // título faria o insert ser deduplicado e devolver null.
    const velha = insertJob(
      raw({ url: "https://exemplo.com/vaga/velha", title: "Vaga Antiga", postedAt: "2020-01-01T00:00:00Z" })
    )!;

    const a = scoreJob(config, getJob(hoje.id)!).detail.recency!;
    const b = scoreJob(config, getJob(velha.id)!).detail.recency!;

    assert.ok(a > b, `vaga de hoje (${a}) tem de pontuar acima da de 2020 (${b})`);
    assert.equal(b, 6, "vaga velha assenta no piso: 0.4 × 0.15 × 100");
    assert.equal(a, 15, "vaga de hoje leva o componente cheio");
  });

  it("os componentes sempre somam o score", () => {
    const job = insertJob(raw({ remoteType: "remote", location: "Brazil" }))!;
    const { score, detail } = scoreJob(config, getJob(job.id)!);
    const soma = Object.values(detail).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(soma - score) < 0.01, `soma ${soma} != score ${score}`);
  });

  it("remoto pontua location_fit cheio; onsite fora do Brasil pontua quase zero", () => {
    const remoto = insertJob(raw({ url: "https://x/1", remoteType: "remote" }))!;
    const fora = insertJob(raw({ url: "https://x/2", title: "Outra Coisa", remoteType: "onsite", location: "Berlin, Germany" }))!;
    assert.equal(scoreJob(config, getJob(remoto.id)!).detail.location_fit, 15);
    assert.equal(scoreJob(config, getJob(fora.id)!).detail.location_fit, 1.5);
  });

  it("recência decai em 21 dias e assenta no piso de calibração", () => {
    // Antes do `recency_floor` esta asserção era `=== 0`. Ela falhou ao introduzirmos
    // o piso, que é o comportamento correto de um teste que congela aritmética.
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    const antigo = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const a = insertJob(raw({ url: "https://x/3", postedAt: ontem }))!;
    const b = insertJob(raw({ url: "https://x/4", title: "Outra Vaga Aqui", postedAt: antigo }))!;
    assert.ok(scoreJob(config, getJob(a.id)!).detail.recency! > 13, "vaga de ontem tem recência alta");
    assert.equal(
      scoreJob(config, getJob(b.id)!).detail.recency,
      6,
      "vaga de 40 dias assenta no piso (0.4 × 0.15 × 100), não em zero"
    );
  });

  it("idioma fora de pt/en pontua metade", () => {
    const job = insertJob(raw({ language: "de" as RawJob["language"] }))!;
    assert.equal(scoreJob(config, getJob(job.id)!).detail.language_fit, 2.5);
  });
});

describe("scoreNewJobs — filtros duros", () => {
  beforeEach(() => resetDb());

  it("senioridade excluída sai da fila com o motivo registrado", () => {
    const job = insertJob(raw({ title: "Senior QA Engineer" }))!;
    const [r] = scoreNewJobs(config, [job.id]);
    assert.equal(r!.status, "new");
    assert.match(r!.policyAction, /filtrado: senioridade senior/);
  });

  it("anos exigidos acima do teto saem da fila", () => {
    const job = insertJob(
      raw({ title: "Analista de Testes", description: "Exigimos 8 anos de experiência com automação." })
    )!;
    const [r] = scoreNewJobs(config, [job.id]);
    assert.equal(r!.status, "new");
    assert.match(r!.policyAction, /filtrado: exige 8\+ anos/);
  });

  it("exclude_title_keywords casa palavra inteira, não substring", () => {
    const cfg = { ...config, filters: { ...config.filters, exclude_title_keywords: ["PL"] } };
    const pleno = insertJob(raw({ url: "https://x/10", title: "Analista de QA PL" }))!;
    const plsql = insertJob(raw({ url: "https://x/11", title: "Desenvolvedor PL SQL Pleno" }))!;
    const limpo = insertJob(raw({ url: "https://x/12", title: "Analista de Suporte" }))!;

    assert.match(scoreNewJobs(cfg, [pleno.id])[0]!.policyAction, /título contém "PL"/);
    // "PL SQL" tem "pl" como palavra inteira → também casa. Documenta o comportamento real:
    // o filtro por título é lexical e não conhece a exceção PL/SQL do detectSeniority.
    assert.match(scoreNewJobs(cfg, [plsql.id])[0]!.policyAction, /título contém "PL"/);
    assert.doesNotMatch(scoreNewJobs(cfg, [limpo.id])[0]!.policyAction, /título contém/);
  });

  it("retorna ordenado por score decrescente", () => {
    const a = insertJob(raw({ url: "https://x/20", title: "Vaga Remota Boa", remoteType: "remote" }))!;
    const b = insertJob(raw({ url: "https://x/21", title: "Vaga Presencial Fora", remoteType: "onsite", location: "Berlin" }))!;
    const r = scoreNewJobs(config, [b.id, a.id]);
    assert.ok(r[0]!.score >= r[1]!.score);
  });
});
