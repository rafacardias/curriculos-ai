/**
 * Contrato de PARSER de cada fonte — não de disponibilidade da API.
 * Três adapters (wwr, linkedin, manual) parseiam HTML/RSS por regex e não têm
 * schema zod: são os que quebram em silêncio quando o HTML de terceiro muda.
 * Estas fixtures congelam a forma mínima que cada parser exige.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../helpers/sandbox.js";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import { allRoutes } from "../helpers/routes.js";
import { remotive } from "../../src/adapters/remotive.js";
import { remoteok } from "../../src/adapters/remoteok.js";
import { wwr } from "../../src/adapters/weworkremotely.js";
import { gupy } from "../../src/adapters/gupy.js";
import { linkedinGuest } from "../../src/adapters/linkedin-guest.js";
import { stripHtml, detectLanguage } from "../../src/adapters/types.js";

let stub: FetchStub | undefined;
afterEach(() => stub?.restore());

const Q = { query: "quality assurance", location: "Brazil" };

describe("remotive", () => {
  it("mapeia o JSON validado por zod para RawJob", async () => {
    stub = installFetchStub(allRoutes());
    const { jobs, errors } = await remotive.search(Q);
    assert.deepEqual(errors, []);
    assert.equal(jobs.length, 2);
    const j = jobs[0]!;
    assert.equal(j.source, "remotive");
    assert.equal(j.sourceJobId, "9001");
    assert.equal(j.title, "Analista de QA Júnior");
    assert.equal(j.companyName, "Nimbus Labs");
    assert.equal(j.remoteType, "remote");
    assert.equal(j.language, "pt");
    assert.doesNotMatch(j.description!, /<[a-z]/i, "description vem sem tags");
    assert.match(j.rawHtml!, /<p>/, "rawHtml preserva o original para auditoria");
  });
});

describe("remoteok", () => {
  it("descarta o aviso legal do índice 0 e filtra pelos termos da query", async () => {
    stub = installFetchStub(allRoutes());
    const { jobs, errors } = await remoteok.search(Q);
    assert.deepEqual(errors, []);
    assert.equal(jobs.length, 1, "o item 0 é aviso legal, não vaga");
    assert.equal(jobs[0]!.title, "Quality Assurance Analyst");
    assert.equal(jobs[0]!.companyName, "Orbital Data");
    assert.equal(jobs[0]!.salaryRaw, "$40000 - $60000");
  });

  it("query sem match retorna zero vagas, sem erro", async () => {
    stub = installFetchStub(allRoutes());
    const { jobs, errors } = await remoteok.search({ query: "engenharia nuclear submarina" });
    assert.deepEqual(errors, []);
    assert.equal(jobs.length, 0);
  });
});

describe("weworkremotely", () => {
  it("parseia RSS com CDATA e divide 'Empresa: Cargo' no primeiro dois-pontos", async () => {
    stub = installFetchStub(allRoutes());
    const { jobs, errors } = await wwr.search(Q);
    assert.deepEqual(errors, []);
    assert.equal(jobs.length, 1, "o item que não casa a query é descartado");
    assert.equal(jobs[0]!.companyName, "Helios Systems");
    assert.equal(jobs[0]!.title, "Quality Assurance Engineer");
    assert.equal(jobs[0]!.remoteType, "remote");
  });
});

describe("gupy", () => {
  it("mapeia workplaceType e monta location a partir de city/state", async () => {
    stub = installFetchStub(allRoutes());
    const { jobs, errors } = await gupy.search(Q);
    assert.deepEqual(errors, []);
    assert.equal(jobs.length, 2, "a Gupy filtra no servidor: não há filtro cliente por termo");
    assert.equal(jobs[0]!.companyName, "Fictícia Tecnologia");
    assert.equal(jobs[0]!.location, "São Paulo, SP");
    assert.equal(jobs[0]!.remoteType, "remote");
    assert.equal(jobs[0]!.language, "pt");
  });
});

describe("linkedin-guest", () => {
  it("extrai os cards por regex e busca a descrição de cada vaga", async () => {
    stub = installFetchStub(allRoutes());
    const { jobs, errors } = await linkedinGuest.search(Q);
    assert.deepEqual(errors, []);
    assert.equal(jobs.length, 2);

    const estagio = jobs[0]!;
    assert.equal(estagio.title, "Estágio em Quality Assurance");
    assert.equal(estagio.companyName, "Zenith Tech");
    assert.equal(estagio.location, "São Paulo, Brasil");
    assert.match(estagio.url, /^https:\/\/br\.linkedin\.com\/jobs\/view\//);
    assert.doesNotMatch(estagio.url, /\?/, "a query string do refId é cortada");
    assert.match(estagio.description!, /quality assurance/i, "a descrição vem do fetch de detalhe");
  });

  it("faz N+1 requests: buscas paginadas + 1 detalhe por vaga (até 10)", async () => {
    // Era "1 busca + 2 detalhes" enquanto `start=0` era fixo e `limit` era
    // ignorado. Com a paginação real são 2 buscas: a fixture devolve os MESMOS
    // 2 cards em qualquer `start`, então a 2ª página não traz nada novo e a
    // paginação encerra ali — é a sonda que prova que ela não é mais de 1 página.
    stub = installFetchStub(allRoutes());
    await linkedinGuest.search(Q);
    assert.equal(stub.calls.length, 4, "2 buscas (a 2ª só com repetidas) + 2 detalhes");
    assert.match(stub.calls[0]!, /seeMoreJobPostings.*start=0/);
    assert.match(stub.calls[1]!, /seeMoreJobPostings.*start=10/);
  });

  it("HTML sem cards reconhecíveis reporta bloqueio anti-bot em vez de silêncio", async () => {
    stub = installFetchStub([[/linkedin\.com/, { body: "<html><body>blocked</body></html>", contentType: "text/html" }]]);
    const { jobs, errors } = await linkedinGuest.search(Q);
    assert.equal(jobs.length, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /bloqueio anti-bot/);
  });
});

describe("isolamento de falha — contrato 'nunca lance para fora'", () => {
  for (const [id, adapter] of [
    ["remotive", remotive],
    ["remoteok", remoteok],
    ["wwr", wwr],
    ["gupy", gupy],
    ["linkedin", linkedinGuest],
  ] as const) {
    it(`${id}: erro HTTP vira errors[] sem lançar`, async () => {
      stub = installFetchStub([[/./, { body: "boom", status: 503, contentType: "text/plain" }]]);
      const r = await adapter.search(Q);
      assert.deepEqual(r.jobs, []);
      assert.ok(r.errors.length > 0, "o erro precisa ser reportado, não engolido");
    });

    it(`${id}: payload malformado vira errors[] sem lançar`, async () => {
      stub = installFetchStub([[/./, { body: '{"inesperado":true}', contentType: "application/json" }]]);
      const r = await adapter.search(Q);
      assert.equal(Array.isArray(r.jobs), true);
      assert.equal(Array.isArray(r.errors), true);
    });
  }
});

describe("helpers de adapter", () => {
  it("stripHtml remove script, style, tags e entidades", () => {
    const html = "<style>a{}</style><script>x()</script><p>Ol&aacute; &amp; bem-vindo</p>";
    const out = stripHtml(html);
    assert.doesNotMatch(out, /script|style|<p>/);
    assert.match(out, /bem-vindo/);
    assert.match(out, /&/);
  });

  it("detectLanguage separa pt de en pelo vocabulário", () => {
    assert.equal(detectLanguage("Você vai trabalhar com testes que exigem experiência"), "pt");
    assert.equal(detectLanguage("You will work with the team and we require experience"), "en");
  });
});
