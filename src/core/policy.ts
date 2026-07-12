import { ulid } from "ulid";
import { getDb, nowIso } from "../db/client.js";
import type { AppConfig } from "./config.js";
import type { JobRow } from "../db/repo/jobs.js";
import type { SubmissionMode } from "./types.js";

export interface PolicyDecision {
  action: string; // legível: "gerar + review_first" | "ignorar: ..."
  shouldGenerate: boolean;
  submissionMode: SubmissionMode | null;
  rule: string; // regra que decidiu (auditoria)
}

/**
 * Policy engine: decide se vale gerar kit e em qual modo submeter,
 * com base em score, fonte, cooldown de empresa e cap semanal por trilha.
 * Toda decisão é logada em events (type=policy_decision).
 */
export function decidePolicy(config: AppConfig, job: JobRow, score: number, trackHint: string | null): PolicyDecision {
  const db = getDb();
  const p = config.policy;
  let decision: PolicyDecision;

  const cooldownCutoff = new Date(Date.now() - p.cooldown_same_company_days * 86400_000).toISOString();
  const recentApplication = job.company_id
    ? db
        .prepare(
          `SELECT a.id FROM applications a JOIN jobs j ON j.id = a.job_id
           WHERE j.company_id = ? AND a.applied_at >= ? LIMIT 1`
        )
        .get(job.company_id, cooldownCutoff)
    : undefined;

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const weeklyCount = trackHint
    ? (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM applications
             WHERE track_id = ? AND applied_at >= ?`
          )
          .get(trackHint, weekAgo) as { n: number }
      ).n
    : 0;

  if (score < p.generate_min_score) {
    decision = {
      action: `ignorar: score ${score} < ${p.generate_min_score}`,
      shouldGenerate: false,
      submissionMode: null,
      rule: "generate_min_score",
    };
  } else if (recentApplication) {
    decision = {
      action: `aguardar: cooldown de empresa (${p.cooldown_same_company_days}d)`,
      shouldGenerate: false,
      submissionMode: null,
      rule: "cooldown_same_company_days",
    };
  } else if (trackHint && weeklyCount >= p.weekly_cap_per_track) {
    decision = {
      action: `aguardar: cap semanal da trilha ${trackHint} (${weeklyCount}/${p.weekly_cap_per_track})`,
      shouldGenerate: false,
      submissionMode: null,
      rule: "weekly_cap_per_track",
    };
  } else {
    const platform = job.ats_platform ?? "other";
    const configured = config.submission.per_platform[platform] ?? config.submission.default_mode;
    let mode: SubmissionMode = configured;
    if (
      configured === "full_auto" &&
      (score < p.full_auto_min_score || p.full_auto_blocked_sources.includes(job.source))
    ) {
      mode = "review_first";
    }
    if (platform === "linkedin" && mode === "full_auto" && !config.submission.i_accept_ban_risk) {
      mode = "review_first";
    }
    decision = {
      action: `gerar + ${mode}`,
      shouldGenerate: true,
      submissionMode: mode,
      rule: "default",
    };
  }

  db.prepare(
    "INSERT INTO events (id, entity, entity_id, type, payload, created_at) VALUES (?, 'policy', ?, 'policy_decision', ?, ?)"
  ).run(ulid(), job.id, JSON.stringify({ score, trackHint, ...decision }), nowIso());

  return decision;
}
