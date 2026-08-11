/**
 * Paginação do LinkedIn guest.
 *
 * O adapter desestruturava `limit` e o ignorava: `start=0` era FIXO na URL e
 * uma busca trazia sempre uma página (~10 vagas) — todo `per_source` histórico
 * mostra `linkedin: found 8..10`. Estes testes provam que `limit` alto pede mais
 * de uma página, que `start` cresce, e que a paginação para sozinha (página
 * vazia, página só com repetidas, `limit` atingido e teto de páginas) em vez de
 * virar loop contra um endpoint anti-bot.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../helpers/sandbox.js";
import { installFetchStub, type FetchStub, type StubRoute } from "../helpers/net.js";
import { linkedinGuest } from "../../src/adapters/linkedin-guest.js";

let stub: FetchStub | undefined;
afterEach(() => stub?.restore());

const card = (n: number) => `
<li>
  <div class="base-card relative job-search-card">
    <a class="base-card__full-link" href="https://br.linkedin.com/jobs/view/vaga-${n}?refId=abc"></a>
    <div class="base-search-card__info">
      <h3 class="base-search-card__title">Vaga ${n}</h3>
      <h4 class="base-search-card__subtitle"><a class="hidden-nested-link" href="#">Empresa ${n}</a></h4>
      <span class="job-search-card__location">Remoto, Brasil</span>
    </div>
  </div>
</li>`;

/** Uma página de 10 cards com ids distintos, como o endpoint guest devolve. */
const page = (offset: number): StubRoute => ({
  body: `<ul>${Array.from({ length: 10 }, (_, i) => card(offset + i)).join("")}</ul>`,
  contentType: "text/html",
});

const html = (body: string): StubRoute => ({ body, contentType: "text/html" });
const DETAIL: [RegExp, StubRoute] = [
  /linkedin\.com\/jobs\/view\//,
  html(`<div class="show-more-less-html__markup">Descrição da vaga</div>`),
];

const searchCalls = (calls: readonly string[]) => calls.filter((u) => u.includes("seeMoreJobPostings"));
const startOf = (url: string) => Number(url.match(/[?&]start=(\d+)/)?.[1]);

describe("linkedin-guest — paginação", () => {
  it("limit alto pede mais de uma página, com start crescente, e para na página vazia", async () => {
    stub = installFetchStub([
      [/seeMoreJobPostings.*start=0(&|$)/, page(0)],
      [/seeMoreJobPostings.*start=10(&|$)/, page(100)],
      [/seeMoreJobPostings.*start=20(&|$)/, html("<ul></ul>")],
      DETAIL,
    ]);

    const { jobs, errors } = await linkedinGuest.search({ query: "automação", limit: 30 });

    const buscas = searchCalls(stub.calls);
    assert.deepEqual(buscas.map(startOf), [0, 10, 20], "start tem de andar de 10 em 10");
    assert.equal(jobs.length, 20, "duas páginas cheias entram; a terceira veio vazia");
    assert.deepEqual(errors, [], "parar por fim de resultados não é erro");
  });

  it("para no teto de páginas mesmo com resultado infinito", async () => {
    stub = installFetchStub([
      [/seeMoreJobPostings.*start=0(&|$)/, page(0)],
      [/seeMoreJobPostings.*start=10(&|$)/, page(100)],
      [/seeMoreJobPostings.*start=20(&|$)/, page(200)],
      [/seeMoreJobPostings.*start=30(&|$)/, page(300)],
      [/seeMoreJobPostings.*start=40(&|$)/, page(400)],
      // Sem rota para start=50: se o adapter pedir a 6ª página, o kill-switch
      // do stub registra a chamada e a asserção abaixo pega.
      DETAIL,
    ]);

    const { jobs } = await linkedinGuest.search({ query: "automação", limit: 1000 });

    const buscas = searchCalls(stub.calls);
    assert.equal(buscas.length, 5, "o teto de páginas é 5 — orçamento dos 30s do pipeline");
    assert.deepEqual(buscas.map(startOf), [0, 10, 20, 30, 40]);
    assert.equal(jobs.length, 50);
  });

  it("página só com vagas repetidas encerra a paginação (o guest repete cards)", async () => {
    // Mesma página para qualquer start — sem a checagem de progresso isto iria
    // até o teto sem coletar nada novo.
    stub = installFetchStub([[/seeMoreJobPostings/, page(0)], DETAIL]);

    const { jobs } = await linkedinGuest.search({ query: "automação", limit: 50 });

    assert.equal(searchCalls(stub.calls).length, 2, "1ª página + 1 sonda que não trouxe nada novo");
    assert.equal(jobs.length, 10, "url repetida não entra duas vezes");
  });

  it("limit menor que uma página não pagina", async () => {
    stub = installFetchStub([[/seeMoreJobPostings/, page(0)], DETAIL]);

    const { jobs } = await linkedinGuest.search({ query: "automação", limit: 5 });

    assert.equal(searchCalls(stub.calls).length, 1);
    assert.equal(jobs.length, 5, "limit é teto de verdade, não sugestão");
  });

  it("erro depois da 1ª página preserva o que já foi coletado e reporta", async () => {
    stub = installFetchStub([
      [/seeMoreJobPostings.*start=0(&|$)/, page(0)],
      [/seeMoreJobPostings.*start=10(&|$)/, { body: "boom", status: 503, contentType: "text/plain" }],
      DETAIL,
    ]);

    const { jobs, errors } = await linkedinGuest.search({ query: "automação", limit: 30 });

    assert.equal(jobs.length, 10, "10 vagas em mão valem mais que 0 por causa da página 2");
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /paginação parou em start=10/);
  });
});
