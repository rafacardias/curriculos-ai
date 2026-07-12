/**
 * track-status — atualiza o status de uma aplicação no funil.
 *
 *   npx tsx src/cli/track-status.ts <job_id> applied|screening|interview|offer|rejected|withdrawn|ghosted ["nota"]
 *
 * "applied" registra applied_at, abre a URL da vaga no browser e incrementa
 * a company memory. "screening"/"interview" incrementam resposta/entrevista.
 */
import { execFileSync } from "node:child_process";
import { getJob } from "../db/repo/jobs.js";
import { getApplicationByJob, createApplication, setApplicationStatus } from "../db/repo/applications.js";
import { bumpCompanyStat } from "../db/repo/companies.js";
import { nowIso } from "../db/client.js";
import type { ApplicationStatus } from "../core/types.js";

const VALID: ApplicationStatus[] = ["applied", "screening", "interview", "offer", "rejected", "withdrawn", "ghosted"];

const [jobId, status, note] = process.argv.slice(2);
if (!jobId || !VALID.includes(status as ApplicationStatus)) {
  console.error(`uso: track-status <job_id> ${VALID.join("|")} ["nota"]`);
  process.exit(1);
}

const job = getJob(jobId);
if (!job) {
  console.error(`vaga não encontrada: ${jobId}`);
  process.exit(1);
}

let app = getApplicationByJob(jobId);
if (!app) {
  // aplicação feita fora do sistema (sem kit) — registra mesmo assim
  app = createApplication(jobId, job.track_hint, "", "manual");
  console.log("(aplicação registrada sem kit — feita fora do sistema)");
}

const extra: { appliedAt?: string; notes?: string } = { notes: note };
if (status === "applied") {
  extra.appliedAt = nowIso();
  if (job.company_id) bumpCompanyStat(job.company_id, "applications_count");
  try {
    execFileSync("open", [job.url]);
    console.log("(URL da vaga aberta no browser para você aplicar/conferir)");
  } catch {
    console.log(`URL: ${job.url}`);
  }
} else if (status === "screening" && job.company_id) {
  bumpCompanyStat(job.company_id, "responses_count");
} else if (status === "interview" && job.company_id) {
  bumpCompanyStat(job.company_id, "responses_count");
  bumpCompanyStat(job.company_id, "interviews_count");
}

setApplicationStatus(app.id, status as ApplicationStatus, extra);
console.log(`${job.title} @ ${job.company_name} → ${status}${note ? ` (${note})` : ""}`);
