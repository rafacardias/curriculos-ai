/**
 * feedback — registra aprovação/rejeição de vaga e ajusta preference_weights.
 *
 *   npx tsx src/cli/feedback.ts <job_id> aprovar
 *   npx tsx src/cli/feedback.ts <job_id> rejeitar ["motivo"]
 */
import { ulid } from "ulid";
import { getDb, nowIso, transaction } from "../db/client.js";
import { loadConfig } from "../core/config.js";
import { getJob, setJobStatus } from "../db/repo/jobs.js";
import { termsPresent } from "../core/keywords.js";

const [jobId, verdict, reason] = process.argv.slice(2);
if (!jobId || !["aprovar", "rejeitar"].includes(verdict ?? "")) {
  console.error("uso: feedback <job_id> aprovar|rejeitar [motivo]");
  process.exit(1);
}

const job = getJob(jobId);
if (!job) {
  console.error(`vaga não encontrada: ${jobId}`);
  process.exit(1);
}

const config = loadConfig();
const db = getDb();
const approve = verdict === "aprovar";
const delta = approve ? 1 : -1;
const cap = config.preferences.max_weight;

// Chaves de preferência afetadas por este feedback
const keys: string[] = [`company:${job.company_name.toLowerCase()}`, `source:${job.source}`];
if (job.seniority) keys.push(`seniority:${job.seniority}`);
const tracks = db.prepare("SELECT keywords FROM profile_tracks").all() as unknown as Array<{ keywords: string }>;
const lexicon = tracks.flatMap((t) => JSON.parse(t.keywords) as string[]);
const text = `${job.title} ${job.description ?? ""}`;
for (const kw of termsPresent(text, lexicon).slice(0, 8)) {
  keys.push(`kw:${kw.toLowerCase()}`);
}

transaction(() => {
  const upsert = db.prepare(
    `INSERT INTO preference_weights (key, weight, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       weight = MAX(${-cap}, MIN(${cap}, preference_weights.weight + excluded.weight)),
       updated_at = excluded.updated_at`
  );
  for (const key of keys) upsert.run(key, delta, nowIso());

  db.prepare(
    "INSERT INTO events (id, entity, entity_id, type, payload, created_at) VALUES (?, 'job', ?, ?, ?, ?)"
  ).run(
    ulid(),
    jobId,
    approve ? "feedback_approve" : "feedback_reject",
    JSON.stringify({ reason: reason ?? null, keys }),
    nowIso()
  );

  if (!approve) setJobStatus(jobId, "rejected");
});

console.log(`${approve ? "aprovada" : "rejeitada"}: ${job.title} @ ${job.company_name}`);
console.log(`pesos ajustados (${delta > 0 ? "+" : ""}${delta}): ${keys.join(", ")}`);
if (reason) console.log(`motivo: ${reason}`);
