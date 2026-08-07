/**
 * UM caminho de código para chamar o `claude`. Este teste é o que garante isso.
 *
 * Antes de F2 havia dois: o servidor montava o argv inline (sem `--model`, sem
 * teto de custo) e o CLI não tinha nenhum. Duplicação de argv é pior que
 * duplicação de lógica comum — a divergência não aparece em teste, aparece na
 * conta e no modelo errado. Foi assim que a primeira medição rodou em opus.
 *
 * O invariante tem duas metades:
 *   1. só `src/local/harness.ts` escreve flags de CLI do claude;
 *   2. só `src/local/generate-runner.ts` dispara o binário.
 *
 * Se você precisa de uma flag nova, ela entra no construtor e ganha um teste
 * lá — não uma segunda lista aqui.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO_ROOT } from "../helpers/sandbox.js";

const SRC = join(REPO_ROOT, "src");
const CONSTRUTOR = "src/local/harness.ts";
const EXECUTOR = "src/local/generate-runner.ts";

/** Flags do `claude` que só o construtor pode escrever. */
const FLAGS = [
  "--output-format",
  "--allowedTools",
  "--allowed-tools",
  "--disallowedTools",
  "--system-prompt",
  "--append-system-prompt",
  "--max-budget-usd",
  "--strict-mcp-config",
  "--disable-slash-commands",
  "--setting-sources",
  "--mcp-config",
  "--dangerously-skip-permissions",
  "--permission-mode",
  "--safe-mode",
  "--bare",
];

function arquivosTs(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivosTs(p, acc);
    else if (nome.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

/** Remove comentários — a proibição é sobre código, não sobre documentação. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("um caminho só para invocar o claude", () => {
  const arquivos = arquivosTs(SRC).map((p) => ({
    rel: relative(REPO_ROOT, p),
    codigo: semComentarios(readFileSync(p, "utf-8")),
  }));

  it("a varredura enxerga o próprio construtor — controle positivo", () => {
    // Sem este controle, um bug no scanner (path errado, regex que não casa)
    // faria o teste passar sempre e não protegeria nada. "Passou" só significa
    // algo se o teste sabe reprovar.
    const construtor = arquivos.find((a) => a.rel === CONSTRUTOR);
    assert.ok(construtor, `${CONSTRUTOR} não foi encontrado pela varredura`);
    const achadas = FLAGS.filter((f) => construtor.codigo.includes(`"${f}"`));
    assert.ok(
      achadas.length >= 5,
      `o scanner deveria ver as flags dentro de ${CONSTRUTOR}; viu ${achadas.length}`
    );
  });

  it("nenhum arquivo fora do construtor escreve flag de CLI do claude", () => {
    const infratores: string[] = [];
    for (const { rel, codigo } of arquivos) {
      if (rel === CONSTRUTOR) continue;
      for (const flag of FLAGS) {
        if (codigo.includes(`"${flag}"`) || codigo.includes(`'${flag}'`)) {
          infratores.push(`${rel} → ${flag}`);
        }
      }
    }
    assert.deepEqual(
      infratores,
      [],
      `argv de claude montado fora de ${CONSTRUTOR}:\n  ${infratores.join("\n  ")}\n` +
        "Use buildHarnessArgv. Duas listas de flags divergem em silêncio."
    );
  });

  it("só o executor dispara o binário", () => {
    const infratores = arquivos
      .filter(({ rel, codigo }) => rel !== EXECUTOR && /CLAUDE_BIN/.test(codigo))
      .map((a) => a.rel);
    assert.deepEqual(infratores, [], `só ${EXECUTOR} pode resolver o binário do claude`);
  });

  it("o executor abre o log em APPEND — retry não apaga a tentativa anterior", () => {
    // O spawn antigo abria com "w". Foi ele que apagou os sete cartões de erro
    // de 2026-08-06 que o operador pediu para preservar.
    const exec = arquivos.find((a) => a.rel === EXECUTOR);
    assert.ok(exec);
    assert.ok(exec.codigo.includes('openSync(opts.logPath, "a")'), "log tem de abrir em append");
    assert.ok(!/openSync\([^)]*,\s*"w"\)/.test(exec.codigo), 'nenhum openSync com "w"');
  });
});
