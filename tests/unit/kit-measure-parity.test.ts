/**
 * `measure-kit.ts` existe pra pontuar um kit candidato SEM contaminar o funil —
 * mas só vale alguma coisa se rodar os MESMOS gates de conteúdo do `finalize`,
 * na mesma ordem de precedência (ver o cabeçalho do próprio script: "se
 * divergir do finalize, o número não vale nada").
 *
 * Achado no code review de 2026-08-13: `checkWeakBulletPhrasing` (o gate da
 * metodologia CAR) entrou em `kit.ts` e não em `scripts/measure-kit.ts` — um
 * kit podia sair `exit 0` na medição e `exit 3` no finalize de verdade, bem na
 * ferramenta usada pra comparar custo entre vias (`docs/custo-geracao.md`).
 * Corrigido; este teste é o que impede a terceira ocorrência, no mesmo espírito
 * de `tests/unit/harness-single-path.test.ts` (canônico + varredura, não
 * confiar em lembrar de atualizar os dois na mão).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../helpers/sandbox.js";

const KIT = join(REPO_ROOT, "src/cli/kit.ts");
const MEASURE = join(REPO_ROOT, "scripts/measure-kit.ts");

/** Gates de CONTEÚDO (exit 3) que os dois caminhos têm de chamar igual. */
const GATES_DE_CONTEUDO = ["checkExpectedFiles", "checkPlaceholders", "checkWeakBulletPhrasing"];

/** Gates de ATS (exit 4) — mesma exigência, lista separada porque a precedência é outra. */
const GATES_DE_ATS = ["checkAtsHostileHtml", "checkTextFidelity", "checkReadingOrder"];

function chama(codigo: string, fn: string): boolean {
  return new RegExp(`\\b${fn}\\s*\\(`).test(codigo);
}

describe("kit.ts finalize × measure-kit.ts — mesmos gates, mesma precedência", () => {
  const kitCodigo = readFileSync(KIT, "utf-8");
  const measureCodigo = readFileSync(MEASURE, "utf-8");

  it("controle positivo — a varredura enxerga os gates conhecidos no finalize", () => {
    const achados = [...GATES_DE_CONTEUDO, ...GATES_DE_ATS].filter((g) => chama(kitCodigo, g));
    assert.equal(achados.length, GATES_DE_CONTEUDO.length + GATES_DE_ATS.length, "scanner cego");
  });

  for (const gate of GATES_DE_CONTEUDO) {
    it(`gate de conteúdo '${gate}' está nos dois caminhos`, () => {
      assert.ok(chama(kitCodigo, gate), `${gate} sumiu de kit.ts`);
      assert.ok(chama(measureCodigo, gate), `${gate} está em kit.ts mas não em measure-kit.ts`);
    });
  }

  for (const gate of GATES_DE_ATS) {
    it(`gate de ATS '${gate}' está nos dois caminhos`, () => {
      assert.ok(chama(kitCodigo, gate), `${gate} sumiu de kit.ts`);
      assert.ok(chama(measureCodigo, gate), `${gate} está em kit.ts mas não em measure-kit.ts`);
    });
  }
});
