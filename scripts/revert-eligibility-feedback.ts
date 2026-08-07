/**
 * Reparo pontual — estorna o aprendizado que a regra nova proíbe.
 *
 *   npx tsx scripts/revert-eligibility-feedback.ts            # dry-run (default)
 *   npx tsx scripts/revert-eligibility-feedback.ts --commit
 *   npx tsx scripts/revert-eligibility-feedback.ts --since 2026-08-07
 *
 * NÃO É REESCRITA DE HISTÓRIA. É desfazer escritas que a regra de hoje proíbe e
 * que só existem porque a regra chegou tarde. O critério é estreito de propósito:
 * eventos `feedback_reject` que MOVERAM peso (formato legado, sem `learned`) e
 * cujo motivo o próprio operador declarou. Peso movido por aprovação fica.
 *
 * O que a tabela guarda ANTES do corte continua valendo como registro de época,
 * igual à baseline da Onda 1 — não é auditável quanto à classe do motivo, e por
 * isso `scoring.preference` segue em 0.
 *
 * Limite conhecido: o upsert satura em ±max_weight. Se um peso bateu no teto
 * durante o decremento, o estorno não devolve exatamente o que foi tirado. O
 * script detecta e avisa em vez de fingir precisão.
 */
import { getDb } from "../src/db/client.js";
import { getJob } from "../src/db/repo/jobs.js";
import { preferenceKeysFor, bumpPreferenceWeights } from "../src/db/repo/feedback.js";
import { loadConfig } from "../src/core/config.js";
import { parseArgs } from "node:util";
import { backupDb, printBackup } from "../src/db/backup.js";

// `parseArgs`, não `indexOf`. A primeira versão deste script fazia
// `argv[argv.indexOf("--since") + 1]`, e com a flag ausente o indexOf devolve -1:
// `argv[0]` virava o valor. Rodando com `--commit`, o corte virou a string
// "--commit", e `created_at >= '--commit'` é VERDADEIRO para toda data ISO —
// o reparo estornou as ~60 rejeições da história em vez das 5 do dia. Ausência
// lida como valor: CLASSE-01 forma A, dentro do commit que documenta a classe.
const { values } = parseArgs({
  options: { commit: { type: "boolean", default: false }, since: { type: "string", default: "2026-08-07" } },
});
const commit = values.commit;
const since = values.since;
if (!/^\d{4}-\d{2}-\d{2}/.test(since)) {
  console.error(`--since precisa ser uma data ISO (recebi ${JSON.stringify(since)})`);
  process.exit(1);
}
console.log(`corte: created_at >= ${since}${commit ? "  ·  MODO ESCRITA" : "  ·  dry-run"}\n`);

const db = getDb();
const cap = loadConfig().preferences.max_weight;

interface Evt { id: string; entity_id: string; payload: string; created_at: string }
const eventos = db
  .prepare(
    `SELECT id, entity_id, payload, created_at FROM events
      WHERE type = 'feedback_reject' AND created_at >= ? ORDER BY created_at`
  )
  .all(since) as unknown as Evt[];

console.log(`eventos de rejeição desde ${since}: ${eventos.length}\n`);

const estorno = new Map<string, number>();
let considerados = 0;

for (const e of eventos) {
  let p: { reason?: string | null; learned?: boolean };
  try { p = JSON.parse(e.payload); } catch { continue; }
  // Já no formato novo: se não aprendeu, não há o que estornar.
  if (typeof p.learned === "boolean") {
    if (!p.learned) continue;
    // Aprendeu sob a regra nova = foi declarado temático. Fica.
    console.log(`  mantido (temático declarado): ${e.entity_id}`);
    continue;
  }
  const job = getJob(e.entity_id);
  if (!job) { console.log(`  ⚠ vaga sumiu: ${e.entity_id}`); continue; }
  considerados++;
  console.log(`  estornar: ${job.company_name} — ${job.title.slice(0, 44)}`);
  console.log(`            motivo declarado: "${p.reason ?? "(nenhum)"}"`);
  for (const k of preferenceKeysFor(job)) estorno.set(k, (estorno.get(k) ?? 0) + 1);
}

console.log(`\n${considerados} rejeição(ões) legada(s) · ${estorno.size} chaves a estornar\n`);

const atuais = new Map(
  (db.prepare("SELECT key, weight FROM preference_weights").all() as Array<{ key: string; weight: number }>)
    .map((r) => [r.key, r.weight] as const)
);

let saturadas = 0;
for (const [k, delta] of [...estorno].sort((a, b) => b[1] - a[1])) {
  const antes = atuais.get(k) ?? 0;
  const depois = Math.max(-cap, Math.min(cap, antes + delta));
  const clamp = antes + delta !== depois;
  if (clamp) saturadas++;
  console.log(`  ${antes.toFixed(2).padStart(7)} → ${depois.toFixed(2).padStart(7)}  (+${delta})  ${k}${clamp ? "   ⚠ saturado" : ""}`);
}

if (saturadas) {
  console.log(`\n⚠ ${saturadas} chave(s) saturaram no teto ±${cap} — o estorno delas é aproximado.`);
}

if (!commit) {
  console.log("\nDRY-RUN — nada escrito. Para aplicar: --commit");
  process.exit(0);
}

// Backup é PRÉ-CONDIÇÃO de escrita destrutiva, não conveniência — src/db/backup.ts.
const bkp = backupDb("pre-revert");
printBackup(bkp);
const stamp = bkp.path.split("curriculos.")[1]!.split(".")[0]!;

for (const [k, delta] of estorno) bumpPreferenceWeights([k], delta);
db.prepare(
  "INSERT INTO events (id, entity, entity_id, type, payload, created_at) VALUES (?, 'system', 'preference_weights', 'feedback_revert_bulk', ?, ?)"
).run(
  `rev-${stamp}`,
  JSON.stringify({ since, eventos: considerados, chaves: estorno.size, saturadas, motivo: "BUG-007: rejeição por elegibilidade não ensina tema" }),
  new Date().toISOString()
);
console.log("\n✅ estornado.");
