import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { loadConfig, type AppConfig } from "../../src/core/config.js";
import { scoreJob, scoreNewJobs, hardFilterReason } from "../../src/core/scoring.js";
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

  // BUG-006 — a matriz completa de location_fit depois da hierarquia cidade→UF→país.
  // O caso `remoto sem corroboração` era 15 e passou a 9: a flag `remote` da fonte
  // deixou de ser prova de elegibilidade. É a correção, não uma regressão.
  const casos: Array<[string, Partial<RawJob>, number]> = [
    ["cidade da UF do operador, presencial", { remoteType: "onsite", location: "Belo Horizonte, Minas Gerais" }, 15],
    ["cidade brasileira de outra UF, presencial", { remoteType: "onsite", location: "São Paulo, SP" }, 10.5],
    ["cidade brasileira, remoto", { remoteType: "remote", location: "São Paulo, São Paulo" }, 15],
    ["UF por nome, sem cidade conhecida", { remoteType: "onsite", location: "interior de Goiás" }, 10.5],
    ["país por alias", { remoteType: "onsite", location: "Brasil" }, 10.5],
    ["remoto SEM corroboração de região", { remoteType: "remote" }, 9],
    ["remoto em país estrangeiro, sem elegibilidade", { remoteType: "remote", location: "Mangaluru, India" }, 9],
    ["remoto COM região elegível na localidade", { remoteType: "remote", location: "Remote - LATAM" }, 15],
    ["remoto COM região elegível na description", { remoteType: "remote", location: "Lisbon", description: "Open to candidates anywhere." }, 15],
    ["presencial fora do país", { remoteType: "onsite", location: "Berlin, Germany" }, 1.5],
    ["sem informação de localidade nenhuma", {}, 7.5],
  ];

  for (const [nome, over, esperado] of casos) {
    it(`location_fit — ${nome} → ${esperado}`, () => {
      const job = insertJob(raw({ url: `https://x/${encodeURIComponent(nome)}`, title: nome, ...over }))!;
      assert.equal(scoreJob(config, getJob(job.id)!).detail.location_fit, esperado);
    });
  }

  it("a sigla de UF só casa como palavra inteira — 'Palo Alto, CA' não é Pará", () => {
    // Sem essa guarda, "PA" dentro de "Palo Alto" faria uma vaga da Califórnia
    // resolver para o Brasil e ganhar pontuação de localidade brasileira.
    const job = insertJob(raw({ url: "https://x/pa", title: "Vaga Palo Alto", remoteType: "onsite", location: "Palo Alto, CA" }))!;
    assert.equal(scoreJob(config, getJob(job.id)!).detail.location_fit, 1.5, "tem de ser tratada como estrangeira");
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

describe("filtros de elegibilidade — idioma nativo e tecnologia ausente", () => {
  beforeEach(() => resetDb());

  const cfg = (over: Partial<AppConfig["filters"]>): AppConfig => ({
    ...config,
    filters: { ...config.filters, exclude_seniority: [], max_years_required: null, ...over },
  });

  it("BUG-009: 'Russian: native' filtra — e as duas ordens de escrita", () => {
    // A vaga da Freedom24 recebeu kit completo e ~$3 de geração antes de alguém
    // ler o requisito eliminatório que estava no JD desde o começo.
    const c = cfg({ blocking_native_languages: ["russian"] });
    for (const d of ["We assess rigorously. Russian: native. Nice to have: fintech.", "Looking for a native Russian speaker."]) {
      const job = insertJob(raw({ url: `https://x/${d.length}`, title: `Dev ${d.length}`, description: d }))!;
      assert.match(hardFilterReason(c, getJob(job.id)!) ?? "", /exige russian nativo/);
    }
  });

  it("português, inglês e espanhol não entram na lista — não são bloqueio", () => {
    const c = cfg({ blocking_native_languages: ["russian"] });
    const job = insertJob(raw({ description: "Native Portuguese and fluent English required." }))!;
    assert.equal(hardFilterReason(c, getJob(job.id)!), null);
  });

  // Casos REAIS do acervo, com o texto que produziu cada veredito. Dois deles
  // eram falsos positivos de um filtro de keyword simples, e um era o topo da fila.
  const PY: Array<[string, string, boolean]> = [
    ["obrigatório explícito", "Requisitos obrigatórios: Experiência sólida em Python e desenvolvimento backend de APIs.", true],
    ["conhecimento essencial", "Requisitos e qualificações. Conhecimentos essenciais - Python; SQL; Modelagem de dados.", true],
    ["anos de experiência", "3 ou mais anos de experiência com Python; Experiência sólida na construção de agentes.", true],
    ["apenas noções", "Conhecimento de APIs. Noções de Python. Familiaridade com GitHub. Perfil autodidata.", false],
    ["lista de alternativas", "Backend para orquestração (Node.js, Python ou PHP). Integração com APIs internas.", false],
    ["desejável", "Desejável conhecimento em Python. Diferencial: experiência com cloud.", false],
  ];

  for (const [nome, descricao, deveFiltrar] of PY) {
    it(`python — ${nome} → ${deveFiltrar ? "filtra" : "PASSA"}`, () => {
      const c = cfg({ blocking_technologies: ["python"] });
      const job = insertJob(raw({ url: `https://x/${encodeURIComponent(nome)}`, title: nome, description: descricao }))!;
      const r = hardFilterReason(c, getJob(job.id)!);
      if (deveFiltrar) assert.match(r ?? "", /exige python/, `deveria filtrar: ${descricao}`);
      else assert.equal(r, null, `NÃO deveria filtrar (${nome}): ${descricao}`);
    });
  }

  it("presencial fora da UF-base filtra; remote_type nulo NÃO", () => {
    // `remote_type` nulo é ausência de informação, não prova de presencial: das 24
    // vagas fora de MG sem flag, 16 eram NULL do LinkedIn e 5 diziam ser remotas.
    const c = cfg({ exclude_onsite_outside_home_uf: true });
    const fora = insertJob(raw({ url: "https://x/sp", title: "Vaga SP", remoteType: "onsite", location: "São Paulo, SP" }))!;
    assert.match(hardFilterReason(c, getJob(fora.id)!) ?? "", /onsite fora de SP/);

    const semFlag = insertJob(raw({ url: "https://x/nf", title: "Vaga sem flag", location: "São Paulo, SP" }))!;
    assert.equal(hardFilterReason(c, getJob(semFlag.id)!), null, "sem flag não pode ser filtrada");

    const emCasa = insertJob(raw({ url: "https://x/bh", title: "Vaga BH", remoteType: "onsite", location: "Belo Horizonte, MG" }))!;
    assert.equal(hardFilterReason(c, getJob(emCasa.id)!), null);
  });
});
