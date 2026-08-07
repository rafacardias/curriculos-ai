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
} from "../../src/core/modality.js";

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
