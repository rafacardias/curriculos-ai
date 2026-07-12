/**
 * submit — aciona a camada de submissão para um kit pronto.
 *
 *   npx tsx src/cli/submit.ts <job_id> [--mode review_first|approve_batch|full_auto]
 *   npx tsx src/cli/submit.ts --batch            # todos os kit_ready em approve_batch
 *   npx tsx src/cli/submit.ts --pending          # lista submissões pausadas
 *
 * O modo default vem do policy engine / config (per_platform). full_auto em
 * vaga LinkedIn exige i_accept_ban_risk no config (o policy engine já bloqueia).
 */
import { parseArgs } from "node:util";
import { getDb } from "../db/client.js";
import { getJob } from "../db/repo/jobs.js";
import { getApplicationByJob } from "../db/repo/applications.js";
import { loadMasterProfile } from "../core/profile.js";
import { loadConfig } from "../core/config.js";
import { decidePolicy } from "../core/policy.js";
import { runSubmission, loadKitForSubmission } from "../submit/runner.js";
import type { SubmissionMode } from "../core/types.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mode: { type: "string" },
    batch: { type: "boolean", default: false },
    pending: { type: "boolean", default: false },
  },
});

const db = getDb();
const config = loadConfig();
const profile = loadMasterProfile();

if (values.pending) {
  const rows = db
    .prepare(
      `SELECT s.id, s.pending_question, j.title, j.company_name, j.id AS job_id
       FROM submissions s JOIN applications a ON a.id = s.application_id
       JOIN jobs j ON j.id = a.job_id WHERE s.status = 'awaiting_user'`
    )
    .all() as unknown as Array<{ id: string; pending_question: string | null; title: string; company_name: string; job_id: string }>;
  if (!rows.length) console.log("nenhuma submissão pausada.");
  for (const r of rows) {
    console.log(`[job ${r.job_id}] ${r.title} @ ${r.company_name}`);
    console.log(`    perguntas sem resposta: ${r.pending_question}`);
  }
  process.exit(0);
}

async function submitOne(jobId: string, modeOverride?: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error(`vaga não encontrada: ${jobId}`);
  const app = getApplicationByJob(jobId);
  if (!app || !app.kit_dir) throw new Error(`sem kit pronto para ${jobId} — rode /gerar antes.`);

  const policy = decidePolicy(config, job, job.score ?? 0, job.track_hint);
  const mode = (modeOverride ?? policy.submissionMode ?? config.submission.default_mode) as SubmissionMode;

  if (mode === "full_auto" && !policy.shouldGenerate) {
    console.log(`policy engine bloqueou full_auto: ${policy.action} — usando review_first.`);
  }
  const effectiveMode: SubmissionMode =
    mode === "full_auto" && !policy.shouldGenerate ? "review_first" : mode;

  const kit = loadKitForSubmission(
    jobId,
    app.id,
    app.kit_dir,
    profile,
    (job.language as "pt" | "en") ?? "pt"
  );

  console.log(`submetendo: ${job.title} @ ${job.company_name} (${job.ats_platform}, modo ${effectiveMode})`);

  if (job.ats_platform === "linkedin") {
    const { runEasyApply } = await import("../submit/linkedin-easyapply.js");
    const autoSubmit = effectiveMode !== "review_first" && config.submission.i_accept_ban_risk;
    if (effectiveMode !== "review_first" && !config.submission.i_accept_ban_risk) {
      console.log("Easy Apply automático exige i_accept_ban_risk: true no config — rodando como review_first.");
    }
    const { context, outcome, submitted } = await runEasyApply(kit, job.url, autoSubmit);
    console.log(`campos preenchidos: ${outcome.filled.length}`);
    if (outcome.unknown.length) console.log(`sem resposta: ${outcome.unknown.join(" | ")}`);
    if (submitted) {
      console.log("candidatura Easy Apply ENVIADA.");
      await context.close();
    } else {
      console.log("parado antes do envio — revise no browser e clique você mesmo (janela fica aberta).");
      // mantém o browser aberto até o usuário fechar
      await context.waitForEvent("close", { timeout: 30 * 60_000 }).catch(() => {});
      await context.close().catch(() => {});
    }
    return;
  }

  const result = await runSubmission(kit, job.url, effectiveMode, job.company_id);
  console.log(`resultado: ${result.status}`);
  if (result.status === "awaiting_user") {
    console.log(`perguntas sem resposta: ${result.unknown.join(" | ")}`);
    console.log("responda via /respostas pending e rode /submeter de novo.");
  }
  if (result.receiptPath) console.log(`receipt: ${result.receiptPath}`);
}

if (values.batch) {
  const rows = db
    .prepare("SELECT job_id FROM applications WHERE status = 'kit_ready'")
    .all() as unknown as Array<{ job_id: string }>;
  if (!rows.length) console.log("nenhum kit pronto para submeter.");
  for (const r of rows) {
    try {
      await submitOne(r.job_id, values.mode ?? "approve_batch");
    } catch (err) {
      console.error(`falha em ${r.job_id}: ${String(err)}`);
    }
  }
} else {
  const jobId = positionals[0];
  if (!jobId) {
    console.error("uso: submit <job_id> [--mode ...] | --batch | --pending");
    process.exit(1);
  }
  await submitOne(jobId, values.mode);
}
