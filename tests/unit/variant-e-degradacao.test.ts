/**
 * Dois guardas que existem porque a ausência de uma declaração foi lida como
 * default seguro — e um caminho de falha que funcionou por sorte antes de ser
 * garantido.
 *
 * 1. VARIANTE (CLASSE-01 forma A, camada de experimento). O `prepare` atribui a
 *    variante, o `finalize` a copia para `resume_versions`, o /painel agrega
 *    conversão por variante. Nada nesse caminho verificava que o REDATOR sabia
 *    da variante — e as `REGRAS` do prompt portátil não a mencionavam. Um kit
 *    do caminho novo teria entrado no warehouse como "variante B" tendo sido
 *    escrito sem disciplina nenhuma, e nenhum número acusaria.
 *
 * 2. tools × allowed_tools. Duas flags que parecem uma. Sem a segunda, o
 *    WebSearch voltou em `permission_denials` — silenciosamente.
 *
 * 3. Degradação honesta do salário: sem faixa confiável, o resultado é `null`,
 *    o kit sai com `[CONFIRMAR:` e o finalize sai 3. Isso aconteceu de verdade
 *    em 2026-08-07 por acidente. Agora é intenção testada.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertVariantDeclarada, VariantError } from "../../src/core/variant-guard.js";
import { buildHarnessArgv, HarnessProfileError, type HarnessProfile } from "../../src/local/harness.js";
import { parseSalaryResponse } from "../../src/local/salary.js";
import { checkPlaceholders } from "../../src/core/gates.js";

const VARIANTE_OK = { variant: { id: "A", headline_style: "metric-first" } };

describe("guarda da variante do experimento", () => {
  it("CONTROLE POSITIVO: bundle com variante declarada passa", () => {
    // Sem este controle, um guarda que lançasse sempre pareceria correto em
    // todos os casos negativos e quebraria o sistema inteiro.
    assert.doesNotThrow(() => assertVariantDeclarada(VARIANTE_OK, true, "teste"));
  });

  it("experimento LIGADO + variante ausente → recusa, não assume default", () => {
    assert.throws(() => assertVariantDeclarada({}, true, "teste"), VariantError);
    assert.throws(() => assertVariantDeclarada({ variant: null }, true, "teste"), VariantError);
  });

  it("variante malformada também recusa (id ausente, vazio ou não-string)", () => {
    for (const ruim of [{ variant: {} }, { variant: { id: "" } }, { variant: { id: 3 } }, { variant: "A" }]) {
      assert.throws(() => assertVariantDeclarada(ruim as never, true, "teste"), VariantError);
    }
  });

  it("bundle ausente recusa — sem ele não se sabe o que o redator recebeu", () => {
    assert.throws(() => assertVariantDeclarada(null, true, "teste"), VariantError);
  });

  it("experimento DESLIGADO: variante nula é o estado correto, não falha", () => {
    // Aqui a ausência é declarada e significativa. O guarda não pode confundir
    // "o operador desligou o experimento" com "alguém esqueceu de declarar".
    assert.doesNotThrow(() => assertVariantDeclarada({ variant: null }, false, "teste"));
    assert.doesNotThrow(() => assertVariantDeclarada(null, false, "teste"));
  });
});

const BASE: HarnessProfile = { model: "claude-sonnet-5", tools: [], max_budget_usd: 1 };

describe("tools × allowed_tools — duas flags que parecem uma", () => {
  it("CONTROLE POSITIVO: tool declarada COM allowlist passa", () => {
    assert.doesNotThrow(() =>
      buildHarnessArgv("salario", { ...BASE, tools: ["WebSearch"], allowed_tools: ["WebSearch"] }, {
        systemPrompt: "s",
      })
    );
  });

  it("tool sem allowlist correspondente → recusa", () => {
    // Medido: com só `tools: [WebSearch]` o modelo tentou buscar duas vezes e as
    // duas voltaram em permission_denials, sem erro nenhum no processo pai.
    assert.throws(
      () => buildHarnessArgv("salario", { ...BASE, tools: ["WebSearch"] }, { systemPrompt: "s" }),
      HarnessProfileError
    );
  });

  it("allowlist parcial também recusa, e nomeia qual faltou", () => {
    try {
      buildHarnessArgv(
        "x",
        { ...BASE, tools: ["WebSearch", "WebFetch"], allowed_tools: ["WebSearch"] },
        { systemPrompt: "s" }
      );
      assert.fail("deveria ter lançado");
    } catch (e) {
      assert.ok(e instanceof HarnessProfileError);
      assert.match(e.message, /WebFetch/);
    }
  });

  it("tools vazio não exige allowlist — não há o que permitir", () => {
    assert.doesNotThrow(() => buildHarnessArgv("redacao", BASE, { systemPrompt: "s" }));
  });
});

describe("degradação honesta da pesquisa salarial", () => {
  it("CONTROLE POSITIVO: resposta boa devolve faixa e fontes", () => {
    const r = parseSalaryResponse(
      "FAIXA: R$ 6.000 a R$ 8.000, aberto a negociação.\nFONTES: Glassdoor R$ 6–12k; Robert Half R$ 6–10k"
    );
    assert.ok(r);
    assert.match(r.faixa, /6\.000/);
    assert.match(r.fontes, /Glassdoor/);
  });

  it("marcador INDISPONIVEL → null", () => {
    assert.equal(parseSalaryResponse("FAIXA: INDISPONIVEL"), null);
  });

  it("o modelo narrando a falha dentro do campo também → null", () => {
    // Foi literalmente isto que voltou quando o WebSearch caiu em
    // permission_denied. O modelo não usou o marcador: escreveu a falha na
    // linha da FAIXA. Se o parser aceitasse, "Não disponível no momento" viraria
    // a pretensão salarial declarada num formulário.
    const reais = [
      "FAIXA: Não disponível no momento (falha de permissão na busca).\nFONTES: N/A",
      "FAIXA: não consegui pesquisar",
      "FAIXA: Indisponível",
      "FAIXA: N/A",
    ];
    for (const t of reais) assert.equal(parseSalaryResponse(t), null, t);
  });

  it("sem linha FAIXA → null", () => {
    assert.equal(parseSalaryResponse("Claro! Aqui está minha análise do mercado."), null);
  });

  it("o null vira [CONFIRMAR: e o [CONFIRMAR: reprova no gate — a cadeia inteira", () => {
    // A prova de que a degradação é INTENCIONAL e não só "não escreve nada":
    // sem faixa, o answers.md carrega o marcador, e o marcador é exit 3.
    assert.equal(parseSalaryResponse("FAIXA: INDISPONIVEL"), null);
    const falha = checkPlaceholders({
      "answers.md": "## Pretensão salarial\n[CONFIRMAR: pretensão salarial]\n",
    });
    assert.ok(falha, "marcador sobrevivente TEM de reprovar");
    assert.equal(falha.gate, "placeholder");
  });
});
