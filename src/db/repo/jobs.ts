import { ulid } from "ulid";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, nowIso, PROJECT_ROOT } from "../client.js";
import { jobFingerprint, detectAtsPlatform, detectSeniority } from "../../core/dedup.js";
import { upsertCompany } from "./companies.js";
import type { RawJob } from "../../core/types.js";

export interface JobRow {
  id: string;
  fingerprint: string;
  source: string;
  source_job_id: string | null;
  url: string;
  title: string;
  company_id: string | null;
  company_name: string;
  location: string | null;
  remote_type: string | null;
  salary_raw: string | null;
  description: string | null;
  raw_html: string | null;
  jd_snapshot_path: string | null;
  language: string | null;
  seniority: string | null;
  ats_platform: string | null;
  posted_at: string | null;
  seen_at: string;
  score: number | null;
  score_detail: string | null;
  track_hint: string | null;
  policy_action: string | null;
  status: string;
}

const SNAPSHOT_DIR = join(PROJECT_ROOT, "output", "_jd-snapshots");

/** Insere vaga nova; retorna null se o fingerprint já existe (dedup). */
export function insertJob(raw: RawJob): JobRow | null {
  const db = getDb();
  const fingerprint = jobFingerprint(raw);
  const exists = db.prepare("SELECT id FROM jobs WHERE fingerprint = ?").get(fingerprint);
  if (exists) return null;

  const id = ulid();
  const company = upsertCompany(raw.companyName);

  let snapshotPath: string | null = null;
  if (raw.rawHtml || raw.description) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    snapshotPath = join(SNAPSHOT_DIR, `${id}.html`);
    writeFileSync(
      snapshotPath,
      raw.rawHtml ?? `<pre>${raw.description}</pre>`,
      "utf-8"
    );
  }

  const row: JobRow = {
    id,
    fingerprint,
    source: raw.source,
    source_job_id: raw.sourceJobId ?? null,
    url: raw.url,
    title: raw.title,
    company_id: company.id,
    company_name: raw.companyName,
    location: raw.location ?? null,
    remote_type: raw.remoteType ?? null,
    salary_raw: raw.salaryRaw ?? null,
    description: raw.description ?? null,
    raw_html: raw.rawHtml ?? null,
    jd_snapshot_path: snapshotPath,
    language: raw.language ?? null,
    seniority: detectSeniority(raw.title) ?? null,
    ats_platform: detectAtsPlatform(raw.url),
    posted_at: raw.postedAt ?? null,
    seen_at: nowIso(),
    score: null,
    score_detail: null,
    track_hint: null,
    policy_action: null,
    status: "new",
  };

  db.prepare(
    `INSERT INTO jobs (id, fingerprint, source, source_job_id, url, title, company_id, company_name,
       location, remote_type, salary_raw, description, raw_html, jd_snapshot_path, language,
       seniority, ats_platform, posted_at, seen_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id, row.fingerprint, row.source, row.source_job_id, row.url, row.title,
    row.company_id, row.company_name, row.location, row.remote_type, row.salary_raw,
    row.description, row.raw_html, row.jd_snapshot_path, row.language, row.seniority,
    row.ats_platform, row.posted_at, row.seen_at, row.status
  );
  return row;
}

export function getJob(id: string): JobRow | undefined {
  return getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
}

export function updateJobScore(
  id: string,
  score: number,
  detail: Record<string, number>,
  trackHint: string | null,
  policyAction: string,
  status: "new" | "queued"
): void {
  getDb()
    .prepare(
      `UPDATE jobs SET score = ?, score_detail = ?, track_hint = ?, policy_action = ?, status = ?
       WHERE id = ?`
    )
    .run(score, JSON.stringify(detail), trackHint, policyAction, status, id);
}

export function setJobStatus(id: string, status: string): void {
  getDb().prepare("UPDATE jobs SET status = ? WHERE id = ?").run(status, id);
}

export function listQueuedJobs(limit = 20): JobRow[] {
  return getDb()
    .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY score DESC LIMIT ?")
    .all(limit) as unknown as JobRow[];
}
