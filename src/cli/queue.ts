/**
 * queue — inspeciona a fila ranqueada de vagas.
 *
 *   npx tsx src/cli/queue.ts [--limit 20] [--json]
 *   npx tsx src/cli/queue.ts --digest        # resumo geral p/ /status
 */
import { parseArgs } from "node:util";
import { getDb } from "../db/client.js";
import { listQueuedJobs } from "../db/repo/jobs.js";

const { values } = parseArgs({
  options: {
    limit: { type: "string", default: "20" },
    json: { type: "boolean", default: false },
    digest: { type: "boolean", default: false },
  },
});

const db = getDb();

if (values.digest) {
  const count = (sql: string, ...args: string[]) =>
    (db.prepare(sql).get(...args) as { n: number }).n;
  const queued = count("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued'");
  const kitsReady = count("SELECT COUNT(*) AS n FROM applications WHERE status = 'kit_ready'");
  const awaiting = count("SELECT COUNT(*) AS n FROM submissions WHERE status = 'awaiting_user'");
  const cutoff7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const staleFollowups = count(
    "SELECT COUNT(*) AS n FROM applications WHERE status = 'applied' AND applied_at < ?",
    cutoff7d
  );
  const lastRun = db
    .prepare("SELECT started_at, mode, per_source FROM search_runs ORDER BY started_at DESC LIMIT 1")
    .get() as { started_at: string; mode: string; per_source: string | null } | undefined;

  console.log(`fila: ${queued} vagas`);
  console.log(`kits prontos (aguardando submissão): ${kitsReady}`);
  console.log(`submissões pausadas (awaiting_user): ${awaiting}`);
  console.log(`follow-ups pendentes (applied > 7d sem resposta): ${staleFollowups}`);
  if (lastRun) {
    const ageH = Math.round((Date.now() - new Date(lastRun.started_at).getTime()) / 3600_000);
    console.log(`última busca: há ${ageH}h (${lastRun.mode})${ageH > 26 ? "  ⚠ desatualizada" : ""}`);
    if (lastRun.per_source) {
      const per = JSON.parse(lastRun.per_source) as Record<string, { found: number; new: number; errors: string[] }>;
      for (const [src, s] of Object.entries(per)) {
        if (s.errors.length) console.log(`  ⚠ ${src}: ${s.errors.join("; ")}`);
      }
    }
  } else {
    console.log("última busca: nunca rodou");
  }
  process.exit(0);
}

const jobs = listQueuedJobs(parseInt(values.limit ?? "20", 10));
if (values.json) {
  console.log(JSON.stringify(jobs, null, 2));
} else {
  if (!jobs.length) console.log("fila vazia — rode /buscar.");
  for (const j of jobs) {
    console.log(`[${j.score}] ${j.title} @ ${j.company_name}`);
    console.log(
      `    id ${j.id} · ${j.source} · ${j.ats_platform} · trilha ${j.track_hint ?? "?"} · ${j.policy_action ?? ""}`
    );
    if (j.score_detail) {
      const d = JSON.parse(j.score_detail) as Record<string, number>;
      console.log(`    score: ${Object.entries(d).map(([k, v]) => `${k}=${v}`).join(" · ")}`);
    }
    console.log(`    ${j.url}`);
  }
}
