/**
 * Alerta de fonte morta — leitura de histórico de `search_runs`.
 *
 * O caso real: em 2026-07-13 o LinkedIn ficou em timeout por 4 corridas seguidas,
 * caiu e voltou sem ninguém saber, porque só a última corrida era lida (a queda
 * só foi descoberta abrindo o banco à mão). Aqui se congela a distinção que faz o
 * alerta valer alguma coisa: falha isolada é ruído, falha seguida é fonte morta,
 * e corrida em que a fonte nem participou não é falha nenhuma.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ulid } from "ulid";
import { resetDb } from "../helpers/sandbox.js";
import { getDb } from "../../src/db/client.js";
import { getSourceHealth, listDeadSources } from "../../src/db/repo/search-runs.js";

type Stats = { found: number; new: number; errors: string[] };
const ok = (): Stats => ({ found: 3, new: 1, errors: [] });
const falha = (msg: string): Stats => ({ found: 0, new: 0, errors: [msg] });

/** Corridas são gravadas da mais antiga para a mais recente, com `started_at` distinto. */
let minuto = 0;
function corrida(perSource: Record<string, Stats>): string {
  const startedAt = new Date(Date.UTC(2026, 7, 1, 10, minuto++)).toISOString();
  getDb()
    .prepare(
      `INSERT INTO search_runs (id, mode, query, started_at, finished_at, per_source)
       VALUES (?, 'auto', 'qa junior', ?, ?, ?)`
    )
    .run(ulid(), startedAt, startedAt, JSON.stringify(perSource));
  return startedAt;
}

const saude = (fonte: string, lastN?: number) =>
  getSourceHealth(lastN).find((s) => s.source === fonte);

describe("saúde por fonte (search_runs)", () => {
  beforeEach(() => {
    resetDb();
    minuto = 0;
  });

  it("2 falhas seguidas alertam — é o episódio do LinkedIn em timeout", () => {
    const bom = corrida({ linkedin: ok(), remotive: ok() });
    corrida({ linkedin: falha("timeout 30000ms"), remotive: ok() });
    corrida({ linkedin: falha("timeout 30000ms"), remotive: ok() });

    const mortas = listDeadSources();
    assert.equal(mortas.length, 1, "só o linkedin está morto");
    assert.equal(mortas[0]!.source, "linkedin");
    assert.equal(mortas[0]!.consecutiveFailures, 2);
    assert.equal(mortas[0]!.runsParticipated, 3);
    assert.equal(mortas[0]!.lastError, "timeout 30000ms");
    assert.equal(mortas[0]!.lastOkAt, bom, "o último sucesso é a corrida mais antiga");
  });

  it("falha isolada NÃO alerta", () => {
    corrida({ remotive: ok() });
    corrida({ remotive: ok() });
    corrida({ remotive: falha("500 Internal Server Error") });

    assert.deepEqual(listDeadSources(), [], "uma falha só é ruído, não fonte morta");
    assert.equal(saude("remotive")!.consecutiveFailures, 1);
  });

  it("falha seguida de sucesso na corrida mais recente NÃO alerta", () => {
    corrida({ wwr: falha("timeout 30000ms") });
    corrida({ wwr: falha("timeout 30000ms") });
    const voltou = corrida({ wwr: ok() });

    assert.deepEqual(listDeadSources(), [], "sucesso mais recente encerra a sequência");
    const s = saude("wwr")!;
    assert.equal(s.consecutiveFailures, 0);
    assert.equal(s.lastError, null);
    assert.equal(s.lastOkAt, voltou);
  });

  it("fonte ausente do per_source de uma corrida não conta como falha", () => {
    // A gupy participou de uma corrida só, e funcionou. Não estar nas seguintes
    // é ausência (não foi buscada) — nunca falha.
    const bom = corrida({ gupy: ok(), remotive: ok() });
    corrida({ remotive: ok() });
    corrida({ remotive: ok() });

    assert.deepEqual(listDeadSources(), []);
    const s = saude("gupy")!;
    assert.equal(s.runsParticipated, 1, "só a corrida em que entrou conta");
    assert.equal(s.consecutiveFailures, 0);
    assert.equal(s.lastOkAt, bom);
  });

  it("ausência no meio não quebra a sequência de falhas", () => {
    corrida({ linkedin: falha("timeout 30000ms"), remotive: ok() });
    corrida({ remotive: ok() }); // linkedin fora desta busca
    corrida({ linkedin: falha("ECONNRESET"), remotive: ok() });

    const mortas = listDeadSources();
    assert.equal(mortas.length, 1);
    assert.equal(mortas[0]!.source, "linkedin");
    assert.equal(mortas[0]!.consecutiveFailures, 2, "duas participações, duas falhas");
    assert.equal(mortas[0]!.runsParticipated, 2);
    assert.equal(mortas[0]!.lastError, "ECONNRESET", "o erro reportado é o mais recente");
    assert.equal(mortas[0]!.lastOkAt, null, "nunca funcionou no histórico");
  });

  it("a janela N é parametrizável e limita a contagem", () => {
    corrida({ wwr: falha("timeout 30000ms") });
    corrida({ wwr: falha("timeout 30000ms") });
    corrida({ wwr: falha("timeout 30000ms") });

    assert.equal(saude("wwr")!.consecutiveFailures, 3, "default olha 3 corridas");
    assert.equal(saude("wwr", 2)!.consecutiveFailures, 2);
    assert.equal(saude("wwr", 1)!.consecutiveFailures, 1);
    assert.deepEqual(listDeadSources(1), [], "com janela 1 nunca há 2 falhas seguidas");
  });

  it("banco sem corrida nenhuma devolve lista vazia", () => {
    assert.deepEqual(getSourceHealth(), []);
    assert.deepEqual(listDeadSources(), []);
  });
});
