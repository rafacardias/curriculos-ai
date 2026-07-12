import { getDb } from "../db/client.js";
import { termsPresent, tokenize } from "./keywords.js";
import { decidePolicy } from "./policy.js";
import { getJob, updateJobScore, type JobRow } from "../db/repo/jobs.js";
import type { AppConfig } from "./config.js";

export interface ScoredJob {
  jobId: string;
  title: string;
  company: string;
  score: number;
  scoreDetail: Record<string, number>;
  trackHint: string | null;
  policyAction: string;
  status: "new" | "queued";
}

interface TrackRow {
  id: string;
  keywords: string;
}

/**
 * Score determinístico 0-100 por componentes ponderados (config.scoring).
 * Sem trilhas no DB (perfil ainda não ingerido), o overlap usa os termos do
 * próprio título como proxy fraco — o sistema funciona, mas pontua baixo.
 */
export function scoreJob(config: AppConfig, job: JobRow): { score: number; detail: Record<string, number>; trackHint: string | null } {
  const db = getDb();
  const w = config.scoring;
  const text = `${job.title} ${job.description ?? ""}`;

  // 1. keyword_overlap × melhor trilha
  const tracks = db.prepare("SELECT id, keywords FROM profile_tracks").all() as unknown as TrackRow[];
  let trackHint: string | null = null;
  let overlap = 0;
  if (tracks.length) {
    for (const t of tracks) {
      const kws: string[] = JSON.parse(t.keywords);
      if (!kws.length) continue;
      const hits = termsPresent(text, kws).length;
      const frac = hits / Math.min(kws.length, 15); // satura: 15 keywords batendo = overlap pleno
      if (frac > overlap) {
        overlap = Math.min(frac, 1);
        trackHint = t.id;
      }
    }
  } else {
    overlap = Math.min(tokenize(job.title).length > 0 ? 0.3 : 0, 1);
  }

  // 2. recência (decai em 21 dias)
  let recency = 0.5;
  if (job.posted_at) {
    const ageDays = (Date.now() - new Date(job.posted_at).getTime()) / 86400_000;
    recency = Math.max(0, Math.min(1, 1 - ageDays / 21));
  }

  // 3. fit de local/remoto
  let locationFit = 0.5;
  if (job.remote_type === "remote") locationFit = 1;
  else if (job.location && /brazil|brasil/i.test(job.location)) locationFit = 1;
  else if (job.remote_type === "onsite" && job.location && !/brazil|brasil/i.test(job.location)) locationFit = 0.1;

  // 4. fit de idioma (pt e en são ambos ok para o Rafael)
  const languageFit = job.language === "pt" || job.language === "en" ? 1 : 0.5;

  // 5. preferências aprendidas (feedback)
  const prefRows = db.prepare("SELECT key, weight FROM preference_weights").all() as Array<{ key: string; weight: number }>;
  let prefSum = 0;
  if (prefRows.length) {
    const textNorm = text.toLowerCase();
    for (const { key, weight } of prefRows) {
      const [kind, value] = key.split(":", 2);
      if (!value) continue;
      const match =
        (kind === "kw" && textNorm.includes(value)) ||
        (kind === "company" && job.company_name.toLowerCase().includes(value)) ||
        (kind === "source" && job.source === value) ||
        (kind === "seniority" && job.seniority === value);
      if (match) prefSum += weight;
    }
  }
  const preference = Math.max(-1, Math.min(1, prefSum / config.preferences.max_weight)) / 2 + 0.5;

  const detail: Record<string, number> = {
    keyword_overlap: round2(overlap * w.keyword_overlap * 100),
    recency: round2(recency * w.recency * 100),
    location_fit: round2(locationFit * w.location_fit * 100),
    language_fit: round2(languageFit * w.language_fit * 100),
    preference: round2(preference * w.preference * 100),
  };
  const score = round2(Object.values(detail).reduce((a, b) => a + b, 0));
  return { score, detail, trackHint };
}

/** Pontua vagas recém-inseridas, aplica o policy engine e enfileira as acima do threshold. */
export function scoreNewJobs(config: AppConfig, jobIds: string[]): ScoredJob[] {
  const results: ScoredJob[] = [];
  for (const id of jobIds) {
    const job = getJob(id);
    if (!job) continue;
    const { score, detail, trackHint } = scoreJob(config, job);
    const policy = decidePolicy(config, job, score, trackHint);
    const status: "new" | "queued" = score >= config.queue_threshold ? "queued" : "new";
    updateJobScore(id, score, detail, trackHint, policy.action, status);
    results.push({
      jobId: id,
      title: job.title,
      company: job.company_name,
      score,
      scoreDetail: detail,
      trackHint,
      policyAction: policy.action,
      status,
    });
  }
  return results.sort((a, b) => b.score - a.score);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Decaimento dos pesos aprendidos — chamado uma vez por execução de busca. */
export function decayPreferenceWeights(config: AppConfig): void {
  const db = getDb();
  db.prepare("UPDATE preference_weights SET weight = weight * ?").run(config.preferences.decay);
  db.prepare("DELETE FROM preference_weights WHERE ABS(weight) < 0.05").run();
}
