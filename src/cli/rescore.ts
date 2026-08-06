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
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, DB_PATH, PROJECT_ROOT } from "../db/client.js";
import { loadConfig } from "../core/config.js";
import { rescoreAll, type RescoreChange, type RescorePlan } from "../core/scoring.js";

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`rescore — repontua o acervo com o scorer e o config atuais

  --commit        escreve no banco (default: dry-run, não escreve nada)
  --top <n>       quantas variações individuais listar (default: 10)
  --no-backup     pula o backup no --commit (NÃO recomendado)
  --help

O dry-run é o default. O --commit faz um backup timestampado em db/backups/
antes de qualquer escrita e imprime o sha256 do arquivo.`);
  process.exit(0);
}

const commit = argv.includes("--commit");
const topN = Number(argv[argv.indexOf("--top") + 1]) || 10;

const config = loadConfig();

/** Backup completo do banco antes de qualquer escrita em massa. */
function backupDb(): { path: string; sha256: string; bytes: number } {
  // WAL primeiro: sem o checkpoint, parte dos dados vive no -wal e o .db copiado
  // sairia incompleto — um backup que parece válido e não é.
  getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const dir = join(PROJECT_ROOT, "db", "backups");
  mkdirSync(dir, { recursive: true });
  // ISO sem ':' — legal no APFS, mas ':' em nome de arquivo quebra ferramenta demais.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
  const path = join(dir, `curriculos.${stamp}.db`);
  copyFileSync(DB_PATH, path);
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  return { path, sha256, bytes: statSync(path).size };
}

if (commit) {
  const b = backupDb();
  console.log(`backup: ${b.path.replace(PROJECT_ROOT + "/", "")}  ·  ${(b.bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`sha256: ${b.sha256}\n`);
}

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
  const p = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  console.log(
    `  ${label.padEnd(8)}${s[0]!.toFixed(1).padStart(5)}  ${p(0.5).toFixed(1).padStart(5)}  ` +
      `${p(0.9).toFixed(1).padStart(5)}  ${s[s.length - 1]!.toFixed(1).padStart(5)}  ${String(s.length).padStart(5)}`
  );
}

function fmt(n: number | null): string {
  return n == null ? "  n/a" : n.toFixed(1).padStart(5);
}

function trunc(s: string, n: number): string {
  return (s.length > n ? s.slice(0, n - 1) + "…" : s).padEnd(n);
}

export type { RescoreChange };
