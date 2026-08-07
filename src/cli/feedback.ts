/**
 * feedback — registra aprovação/rejeição de vaga.
 *
 *   npx tsx src/cli/feedback.ts <job_id> aprovar
 *   npx tsx src/cli/feedback.ts <job_id> rejeitar <classe> ["detalhe"]
 *
 * A CLASSE é obrigatória na rejeição, e é ela — não o texto — que decide se o
 * score aprende. Ver `src/core/feedback.ts` (BUG-007).
 */
import { getJob } from "../db/repo/jobs.js";
import { applyFeedback } from "../db/repo/feedback.js";
import { REASON_CLASSES, parseReasonClass } from "../core/feedback.js";

const [jobId, verdict, arg3, arg4] = process.argv.slice(2);

const CLASSES = REASON_CLASSES.map((c) => `  ${c.id.padEnd(14)} ${c.label}${c.learns ? "   ← só esta move peso" : ""}`).join("\n");

if (!jobId || !["aprovar", "rejeitar"].includes(verdict ?? "")) {
  console.error(`uso: feedback <job_id> aprovar
     feedback <job_id> rejeitar <classe> ["detalhe"]

classes de motivo:
${CLASSES}`);
  process.exit(1);
}

const job = getJob(jobId);
if (!job) {
  console.error(`vaga não encontrada: ${jobId}`);
  process.exit(1);
}

const rejeitar = verdict === "rejeitar";
const reasonClass = rejeitar ? parseReasonClass(arg3) : null;
if (rejeitar && !reasonClass) {
  // Recusa em vez de assumir. Classe ausente não aprende — mas errar em silêncio
  // na CLI esconderia do operador que ele deixou de ensinar algo que queria.
  console.error(`classe de motivo inválida ou ausente: "${arg3 ?? ""}"\n\n${CLASSES}`);
  process.exit(1);
}

const { decision, keys } = applyFeedback({
  job,
  verdict: verdict as "aprovar" | "rejeitar",
  reasonClass,
  reason: (rejeitar ? arg4 : arg3) ?? null,
  via: "cli",
});

console.log(`${rejeitar ? "rejeitada" : "aprovada"}: ${job.title} @ ${job.company_name}`);
console.log(
  decision.learn
    ? `pesos ajustados (${decision.delta > 0 ? "+" : ""}${decision.delta}): ${keys.join(", ")}`
    : `SEM ajuste de peso — ${decision.why}`
);
