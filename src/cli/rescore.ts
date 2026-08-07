/**
 * rescore — repontua o acervo já coletado com o scorer e o config ATUAIS.
 *
 * O score de uma vaga é congelado no momento do insert. Sem este comando,
 * qualquer melhoria no scorer (ou mudança de filtro no config.yaml) só alcança
 * vagas futuras: a fila que o operador abre continua ordenada pela régua antiga.
 *
 *   npx tsx src/cli/rescore.ts              # planeja e NÃO escreve (default)
 *   npx tsx src/cli/rescore.ts --commit     # faz backup e escreve
 *   npx tsx src/cli/rescore.ts --top 25     # mostra as 25 maiores variações
 *
 * O default é o dry-run por decisão: escrever é a exceção e precisa ser pedida.
 */
import { parseArgs } from "node:util";
import { loadConfig } from "../core/config.js";
import { backupDb, printBackup } from "../db/backup.js";
import { rescoreAll, type RescoreChange, type RescorePlan } from "../core/scoring.js";

// `parseArgs`, não aritmética sobre `indexOf`. A versão anterior fazia
// `Number(argv[argv.indexOf("--top") + 1]) || 10`, e com a flag ausente o
// indexOf devolve -1: `argv[0]` virava o valor. Aqui o dano ficou escondido
// porque `Number("--commit")` é NaN e o `|| 10` engolia — seguro por acidente,
// não por desenho. Num campo de texto, o mesmo código apagaria o filtro, que é
// exatamente o que aconteceu no script de estorno. Ver KNOWN-BUGS, CLASSE-01
// instância 6.
const { values } = parseArgs({
  options: {
    commit: { type: "boolean", default: false },
    top: { type: "string", default: "10" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`rescore — repontua o acervo com o scorer e o config atuais

  --commit        escreve no banco (default: dry-run, não escreve nada)
  --top <n>       quantas variações individuais listar (default: 10)
  --help

O dry-run é o default. O --commit faz um backup timestampado em db/backups/
antes de qualquer escrita e imprime o sha256 do arquivo.`);
  process.exit(0);
}

const commit = values.commit;
const topN = Number.parseInt(values.top, 10);
if (!Number.isInteger(topN) || topN < 1) {
  console.error(`--top precisa ser um inteiro positivo (recebi ${JSON.stringify(values.top)})`);
  process.exit(1);
}

const config = loadConfig();

if (commit) printBackup(backupDb("pre-rescore"));

const plan = rescoreAll(config, { commit });
report(plan);

if (!commit) {
  console.log("\nDRY-RUN — nada foi escrito. Para aplicar: npx tsx src/cli/rescore.ts --commit");
} else {
  console.log("\n✅ aplicado.");
}

// ─────────────────────────────────────────────────────────────────────────────

function report(plan: RescorePlan): void {
  const queuedBefore = plan.all.filter((c) => c.statusBefore === "queued");
  const queuedAfter = plan.all.filter((c) => c.statusAfter === "queued");

  console.log(`Vagas repontuadas: ${plan.scanned}  ·  com mudança: ${plan.changed.length}`);
  console.log(`Fila: ${queuedBefore.length} → ${queuedAfter.length}`);
  console.log(`  entram: ${plan.entering.length}   ·   saem: ${plan.leaving.length}`);

  const filteredNow = plan.all.filter(
    (c) => c.policyAction.startsWith("filtrado:") && c.statusBefore === "queued"
  );
  if (filteredNow.length) {
    console.log(`  saem por filtro duro do config atual: ${filteredNow.length}`);
  }

  console.log("\nDistribuição do score na FILA (o que o operador realmente lê):");
  console.log("            min     p50     p90     max      n");
  printDist("antes", queuedBefore.map((c) => c.scoreBefore ?? 0));
  printDist("depois", queuedAfter.map((c) => c.scoreAfter));

  const movers = [...plan.changed].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, topN);
  if (movers.length) {
    console.log(`\n${movers.length} maiores variações individuais:`);
    for (const c of movers) {
      const arrow = c.statusBefore === c.statusAfter ? "" : `  [${c.statusBefore} → ${c.statusAfter}]`;
      const sign = c.delta >= 0 ? "+" : "";
      console.log(
        `  ${sign}${c.delta.toFixed(1).padStart(6)}  ${fmt(c.scoreBefore)} → ${c.scoreAfter.toFixed(1).padStart(5)}` +
          `  ${trunc(c.title, 42)}  ${trunc(c.company, 20)}  ${c.source}${arrow}`
      );
    }
  }

  if (plan.leaving.length) {
    console.log(`\nSaindo da fila (${plan.leaving.length}) — confira se alguma vaga boa está sendo despromovida:`);
    for (const c of plan.leaving.slice(0, topN)) {
      console.log(
        `  ${fmt(c.scoreBefore)} → ${c.scoreAfter.toFixed(1).padStart(5)}  ${trunc(c.title, 46)}  ` +
          `${trunc(c.company, 22)}  ${c.policyAction}`
      );
    }
    if (plan.leaving.length > topN) console.log(`  … +${plan.leaving.length - topN}`);
  }
}

function printDist(label: string, values: number[]): void {
  if (!values.length) {
    console.log(`  ${label.padEnd(8)} (fila vazia)`);
    return;
  }
  const s = [...values].sort((a, b) => a - b);
  // Mediana verdadeira (média dos dois centrais em n par) e percentil por ceil.
  // Indexar por `floor` dava um número diferente do de qualquer outra ferramenta
  // que olhasse a mesma fila — e métrica que discorda de si mesma não serve de
  // baseline.
  const p50 = s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  const p90 = s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)]!;
  console.log(
    `  ${label.padEnd(8)}${s[0]!.toFixed(1).padStart(5)}  ${p50.toFixed(1).padStart(5)}  ` +
      `${p90.toFixed(1).padStart(5)}  ${s[s.length - 1]!.toFixed(1).padStart(5)}  ${String(s.length).padStart(5)}`
  );
}

function fmt(n: number | null): string {
  return n == null ? "  n/a" : n.toFixed(1).padStart(5);
}

function trunc(s: string, n: number): string {
  return (s.length > n ? s.slice(0, n - 1) + "…" : s).padEnd(n);
}

export type { RescoreChange };
