/**
 * job-url — atualiza a URL de aplicação de uma vaga (e redetecta o ATS).
 *
 *   npx tsx src/cli/job-url.ts <job_id> <url>
 *
 * Uso típico: vaga veio de board agregador (RemoteOK/Remotive/WWR) que esconde
 * o link do empregador atrás de paywall/redirect — na hora do kit o operador
 * localiza a página de aplicação direta da empresa e grava aqui, o que também
 * habilita o submission adapter correto (greenhouse/lever/...).
 */
import { ulid } from "ulid";
import { getDb, nowIso } from "../db/client.js";
import { detectAtsPlatform } from "../core/dedup.js";
import { getJob } from "../db/repo/jobs.js";

const [jobId, url] = process.argv.slice(2);
if (!jobId || !url || !/^https?:\/\//.test(url)) {
  console.error("uso: job-url <job_id> <url>");
  process.exit(1);
}

const job = getJob(jobId);
if (!job) {
  console.error(`vaga não encontrada: ${jobId}`);
  process.exit(1);
}

const ats = detectAtsPlatform(url);
const db = getDb();
db.prepare("UPDATE jobs SET url = ?, ats_platform = ? WHERE id = ?").run(url, ats, jobId);
db.prepare("INSERT INTO events (id, entity, entity_id, type, payload, created_at) VALUES (?, 'job', ?, 'apply_url_resolved', ?, ?)").run(
  ulid(),
  jobId,
  JSON.stringify({ from: job.url, to: url, ats }),
  nowIso()
);
console.log(`url atualizada: ${job.title} @ ${job.company_name}`);
console.log(`  ${job.url}  →  ${url}`);
console.log(`  ats_platform: ${job.ats_platform ?? "?"} → ${ats}`);
