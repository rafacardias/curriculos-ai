/**
 * O terceiro estado: `unknown` tem que sobreviver a todo o caminho sem virar
 * silenciosamente "remoto" (otimismo) nem "presencial" (o BUG-006 pelo avesso).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveModality,
  remoteHints,
  modalityLabel,
  parseModalityState,
  blocksGeneration,
} from "../../src/core/modality.js";

/** Localidades resolvidas, na forma que `blocksGeneration` consome. */
const EM_CASA = { level: "city", isHomeUf: true };
const FORA = { level: "city", isHomeUf: false };
const SEM_LOCAL = { level: "unknown", isHomeUf: false };

describe("blocksGeneration — cobra a modalidade onde ela custa caro", () => {
  it("pendente + fora da UF-base = recusa antes de gastar a geração", () => {
    assert.ok(blocksGeneration({ remote_type: null, location: "São Paulo, SP" }, FORA));
  });

  it("pendente EM CASA não bloqueia — em BH qualquer modalidade serve", () => {
    // Interromper aqui seria cobrar uma resposta que não muda decisão nenhuma.
    assert.equal(blocksGeneration({ remote_type: null, location: "Belo Horizonte, MG" }, EM_CASA), null);
  });

  it("pendente SEM localidade não bloqueia — não se pune ausência com ausência", () => {
    assert.equal(blocksGeneration({ remote_type: null, location: null }, SEM_LOCAL), null);
  });

  it("estado afirmado nunca bloqueia, seja qual for", () => {
    for (const rt of ["remote", "hybrid", "onsite"]) {
      assert.equal(blocksGeneration({ remote_type: rt, location: "São Paulo, SP" }, FORA), null, rt);
    }
  });
});

describe("resolveModality — precedência e preservação de proveniência", () => {
  it("adapter mudo e operador mudo = unknown, não um chute", () => {
    const m = resolveModality({ remote_type: null });
    assert.equal(m.state, "unknown");
    assert.equal(m.source, null);
    assert.equal(m.adapterSaid, null);
  });

  it("string vazia e valor inventado também caem em unknown", () => {
    // Um adapter novo devolvendo "flexible" não pode entrar como estado válido
    // pela porta dos fundos e escapar do filtro sem ninguém decidir nada.
    assert.equal(resolveModality({ remote_type: "" }).state, "unknown");
    assert.equal(resolveModality({ remote_type: "flexible" }).state, "unknown");
    assert.equal(parseModalityState("REMOTE"), "remote");
    assert.equal(parseModalityState(" hybrid "), "hybrid");
  });

  it("o operador vence o adapter, mas o que o adapter disse continua legível", () => {
    const m = resolveModality({
      remote_type: "remote",
      modality_confirmed: "onsite",
      modality_confirmed_at: "2026-08-07T12:00:00Z",
      modality_note: "JD: 3x por semana no escritório",
    });
    assert.equal(m.state, "onsite");
    assert.equal(m.source, "operator");
    assert.equal(m.adapterSaid, "remote", "a divergência tem que ser inspecionável");
    assert.equal(m.note, "JD: 3x por semana no escritório");
  });

  it("sem confirmação, o estado é o do adapter e a fonte é declarada", () => {
    const m = resolveModality({ remote_type: "hybrid" });
    assert.equal(m.state, "hybrid");
    assert.equal(m.source, "adapter");
  });

  it("o rótulo nunca apresenta pendência como resposta", () => {
    assert.match(modalityLabel(resolveModality({ remote_type: null })), /não informado/);
    assert.match(modalityLabel(resolveModality({ remote_type: "remote" })), /remoto \(fonte\)/);
    assert.match(
      modalityLabel(resolveModality({ remote_type: null, modality_confirmed: "remote" })),
      /remoto \(confirmado\)/
    );
  });
});

describe("remoteHints — evidência para o humano, nunca veredito", () => {
  it("acha as três modalidades e devolve o trecho ao redor", () => {
    const texto =
      "Vaga para analista. O trabalho é 100% remoto, com encontros trimestrais presenciais.";
    const pistas = remoteHints(texto);
    const tipos = pistas.map((p) => p.kind);
    assert.ok(tipos.includes("remote"));
    assert.ok(tipos.includes("onsite"));
    assert.ok(pistas[0]!.snippet.includes("remoto"));
  });

  it("texto ambíguo devolve AS DUAS pistas — não escolhe vencedor", () => {
    // É justamente a contradição que o operador precisa ver. Um resolvedor
    // automático teria que escolher, e escolheria errado metade das vezes.
    const pistas = remoteHints("Modelo híbrido em São Paulo. Possibilidade de home office.");
    assert.ok(pistas.some((p) => p.kind === "hybrid"));
    assert.ok(pistas.some((p) => p.kind === "remote"));
  });

  it("a mesma palavra repetida conta uma vez", () => {
    const pistas = remoteHints("remoto remoto remoto remoto remoto");
    assert.equal(pistas.length, 1, "repetição não é acúmulo de evidência");
  });

  it("texto vazio ou sem menção não inventa pista", () => {
    assert.deepEqual(remoteHints(null), []);
    assert.deepEqual(remoteHints("Analista de dados com foco em BI e dashboards."), []);
  });

  it("não casa palavra dentro de outra", () => {
    assert.deepEqual(remoteHints("A empresa é a Remotech Ltda."), []);
  });
});

/**
 * REGRESSÃO — pista nunca vira estado.
 *
 * Os dois casos abaixo são reais, medidos na fila de 2026-08-07, e são a razão de
 * `remoteHints` existir separado de `resolveModality`:
 *
 *  - Foundever  → "hybrid AI solutions (NLU + LLM)"        — arquitetura de IA
 *  - Raro Labs  → "Auxílio híbrido sem desconto na folha"  — benefício
 *
 * Nenhum dos dois fala de modalidade de trabalho, e um extrator que inferisse
 * estado a partir do texto teria tirado a Foundever (61,9 — top 3 da fila) do ar
 * por causa de uma sigla de arquitetura. É a CLASSE-01 forma B: menção lida como
 * declaração.
 *
 * A defesa NÃO é filtrar essas duas frases — isso seria catálogo de vítimas, e a
 * terceira frase ruim passaria. A defesa é ARQUITETURAL: não existe caminho de
 * texto para estado. `resolveModality` só lê colunas afirmadas, e `ModalityInput`
 * nem sequer tem campo de descrição. Este bloco congela essa separação.
 */
describe("REGRESSÃO — 'hybrid AI solutions' e 'auxílio híbrido' não produzem modalidade", () => {
  const FOUNDEVER =
    "Design best practices and recommendations for LLMs, Agentic AI, and hybrid AI solutions (NLU + LLM). Implement new integrations and backend services.";
  const RARO_LABS =
    "Benefícios: plano de saúde conforme sindicato; Assistência Funerária do Grupo Zelo; Auxílio híbrido sem desconto na folha; Licença paternidade de 15 dias.";

  for (const [nome, texto] of [
    ["Foundever — 'hybrid AI solutions' é arquitetura, não local de trabalho", FOUNDEVER],
    ["Raro Labs — 'Auxílio híbrido' é linha de benefício, não regime", RARO_LABS],
  ] as const) {
    it(`${nome}: continua unknown`, () => {
      // O estado é unknown ANTES e DEPOIS de o texto existir: `resolveModality`
      // não recebe texto nenhum. Passar a descrição como propriedade extra não
      // muda nada — é isso que precisa continuar verdade.
      const semTexto = resolveModality({ remote_type: null });
      const comTexto = resolveModality({ remote_type: null, ...({ description: texto } as object) });
      assert.equal(semTexto.state, "unknown");
      assert.equal(comTexto.state, "unknown", "texto não pode virar estado por nenhuma porta");
      assert.equal(comTexto.source, null);
    });

    it(`${nome}: a pista aparece, e aparece rotulada como pista`, () => {
      // Ela DEVE aparecer — o operador é quem descarta. Suprimir a pista trocaria
      // um falso positivo visível por um falso negativo invisível.
      const pistas = remoteHints(texto);
      assert.ok(pistas.length > 0, "a pista continua sendo mostrada para o humano julgar");
      assert.ok(pistas.every((p) => "snippet" in p && "kind" in p));
      // E o trecho tem que trazer o contexto que denuncia o falso positivo.
      assert.match(pistas[0]!.snippet, /AI solutions|desconto na folha/);
    });
  }

  it("nenhuma quantidade de pista muda o que o gate de geração decide", () => {
    // O gate lê o ESTADO, não o texto. Um JD cheio de "remoto" continua bloqueando
    // até alguém afirmar — que é o ponto.
    const fora = { level: "city", isHomeUf: false };
    assert.ok(blocksGeneration({ remote_type: null, location: "São Paulo, SP" }, fora));
    assert.equal(blocksGeneration({ remote_type: null, modality_confirmed: "remote", location: "São Paulo, SP" }, fora), null);
  });

  it("o tipo de estado afirmável não admite 'unknown' — pendência não é decisão", () => {
    // Se um dia alguém tentar gravar o resultado de uma inferência, vai ter que
    // escolher entre os três afirmáveis. Não existe "unknown confirmado".
    assert.equal(parseModalityState("unknown"), null);
    assert.equal(parseModalityState("hybrid AI solutions"), null);
    assert.equal(parseModalityState("auxílio híbrido"), null);
  });
});
