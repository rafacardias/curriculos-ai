import { ulid } from "ulid";
import { getDb, nowIso } from "../client.js";
import type { ApplicationStatus } from "../../core/types.js";

export interface ApplicationRow {
  id: string;
  job_id: string;
  track_id: string | null;
  status: string;
  applied_at: string | null;
  kit_dir: string | null;
  submission_mode: string | null;
  notes: string | null;
}

export function getApplicationByJob(jobId: string): ApplicationRow | undefined {
  return getDb()
    .prepare("SELECT * FROM applications WHERE job_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(jobId) as unknown as ApplicationRow | undefined;
}

export function createApplication(
  jobId: string,
  trackId: string | null,
  kitDir: string,
  submissionMode: string | null
): ApplicationRow {
  const db = getDb();
  const id = ulid();
  db.prepare(
    `INSERT INTO applications (id, job_id, track_id, status, kit_dir, submission_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'kit_ready', ?, ?, ?, ?)`
  ).run(id, jobId, trackId, kitDir, submissionMode, nowIso(), nowIso());
  return getApplicationByJob(jobId)!;
}

export function setApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
  extra?: { appliedAt?: string; notes?: string }
): void {
  const db = getDb();
  db.prepare(
    `UPDATE applications SET status = ?, updated_at = ?,
       applied_at = COALESCE(?, applied_at),
       notes = COALESCE(?, notes)
     WHERE id = ?`
  ).run(status, nowIso(), extra?.appliedAt ?? null, extra?.notes ?? null, applicationId);

  db.prepare(
    "INSERT INTO events (id, entity, entity_id, type, payload, created_at) VALUES (?, 'application', ?, 'status_change', ?, ?)"
  ).run(ulid(), applicationId, JSON.stringify({ status, notes: extra?.notes ?? null }), nowIso());
}

export function insertResumeVersion(
  applicationId: string,
  paths: { md: string; pdf: string },
  keywordReport: unknown,
  truthcheckResult: unknown,
  variant?: unknown
): string {
  const db = getDb();
  const id = ulid();
  const version =
    ((db
      .prepare("SELECT MAX(version) AS v FROM resume_versions WHERE application_id = ?")
      .get(applicationId) as { v: number | null }).v ?? 0) + 1;
  db.prepare(
    `INSERT INTO resume_versions (id, application_id, version, resume_md_path, resume_pdf_path,
       variant, keyword_report, truthcheck, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, applicationId, version, paths.md, paths.pdf,
    variant ? JSON.stringify(variant) : null,
    JSON.stringify(keywordReport), JSON.stringify(truthcheckResult), nowIso()
  );
  return id;
}
