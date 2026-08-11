/**
 * `location` → `city=` na Gupy: a guarda que impede a capability de zerar a fonte.
 *
 * A Gupy só tem UM recorte geográfico, `city=`, e ele é match EXATO e
 * CASE-SENSITIVE. Medido contra a API real em 2026-08-11:
 *
 *   city=Belo Horizonte  → 10 vagas      city=belo horizonte  → 0
 *   city=São Paulo       → 10 vagas      city=sao paulo       → 0
 *   city=Brazil          →  0 vagas      state=MG             → 0
 *
 * O perigo é o silêncio: valor errado não dá erro, dá lista vazia. E as 7 buscas
 * PT do `config/config.yaml` mandam hoje `location: Brazil` — ligar a capability
 * de `location` sem esta guarda zeraria a Gupy nas sete, sem nenhum sinal.
 *
 * Daí as duas regras testadas aqui: só cidade vira `city=`, e zero-com-filtro é
 * reportado em `ignored` em vez de passar por "não há vaga".
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../helpers/sandbox.js";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import { gupy } from "../../src/adapters/gupy.js";

let stub: FetchStub | undefined;
afterEach(() => stub?.restore());

const VAZIO: Array<[RegExp, { body: string }]> = [
  [/employability-portal\.gupy\.io/, { body: JSON.stringify({ data: [] }) }],
];

describe("gupy: location só vira city= quando resolve como cidade", () => {
  it("país NÃO vira city= — busca sai sem recorte e o motivo fica em `ignored`", async () => {
    stub = installFetchStub(VAZIO);
    const r = await gupy.search({ query: "analista", location: "Brazil" });

    assert.doesNotMatch(stub.calls[0]!, /city=/, "país nunca pode virar city=");
    assert.ok(
      r.ignored?.some((i) => i.includes("country")),
      `o motivo precisa aparecer em ignored, veio: ${JSON.stringify(r.ignored)}`
    );
  });

  it("UF não vira city= — a Gupy devolve 0 tanto para sigla quanto para nome de estado", async () => {
    stub = installFetchStub(VAZIO);
    const r = await gupy.search({ query: "analista", location: "MG" });

    assert.doesNotMatch(stub.calls[0]!, /city=/);
    assert.ok(r.ignored?.some((i) => i.includes("uf")));
  });

  it("cidade vira city= com o valor LITERAL do config, nunca o normalizado do léxico", async () => {
    stub = installFetchStub(VAZIO);
    await gupy.search({ query: "analista", location: "Belo Horizonte" });

    // `resolveLocality` devolve a cidade normalizada ("belo horizonte"), e é
    // exatamente essa forma que a Gupy responde com 0. O que vai pra URL é o
    // que o operador escreveu.
    assert.match(stub.calls[0]!, /city=Belo(%20|\+)Horizonte/);
  });

  it("0 vagas COM city= aplicado é reportado — o exact-match não falha calado", async () => {
    stub = installFetchStub(VAZIO);
    const r = await gupy.search({ query: "analista", location: "Belo Horizonte" });

    assert.ok(
      r.ignored?.some((i) => i.includes("0 vagas")),
      `zero-com-filtro tem de ser dito em voz alta, veio: ${JSON.stringify(r.ignored)}`
    );
  });

  it("sem location, nenhum city= e nada em ignored", async () => {
    stub = installFetchStub(VAZIO);
    const r = await gupy.search({ query: "analista" });

    assert.doesNotMatch(stub.calls[0]!, /city=/);
    assert.deepEqual(r.ignored, [], "não pedir recorte não é recorte ignorado");
  });
});
