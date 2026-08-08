import { ulid } from "ulid";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, nowIso, PROJECT_ROOT } from "../client.js";
import { jobFingerprint, detectAtsPlatform, detectSeniority } from "../../core/dedup.js";
import { upsertCompany } from "./companies.js";
import type { RawJob } from "../../core/types.js";
import type { AssertedModality } from "../../core/modality.js";

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
  /** Score original, do momento do insert. Escrito uma única vez, na 1ª repontuação. */
  score_previous: number | null;
  score_rescored_at: string | null;
  /**
   * Modalidade confirmada PELO OPERADOR. Separada de `remote_type` (o que o
   * adapter afirmou) para não apagar a proveniência — ver `src/core/modality.ts`.
   */
  modality_confirmed: string | null;
  modality_confirmed_at: string | null;
  modality_note: string | null;
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
    score_previous: null,
    score_rescored_at: null,
    modality_confirmed: null,
    modality_confirmed_at: null,
    modality_note: null,
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

/**
 * Vagas elegíveis para repontuação em massa.
 *
 * Duas exclusões deliberadas:
 *  - status `expired`/`applied_elsewhere`: já saíram do funil, repontuar é ruído;
 *  - qualquer vaga com linha em `applications`: repontuar uma vaga onde já houve
 *    kit ou candidatura corromperia o histórico. O filtro é por `applications`,
 *    não por `jobs.status`, porque `kit_ready`/`applied` vivem lá — em `jobs` a
 *    vaga continua marcada como `queued` e passaria batido.
 */
export function listRescorableJobs(): JobRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM jobs
        WHERE status IN ('new','queued','rejected')
          AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id)
        ORDER BY id`
    )
    .all() as unknown as JobRow[];
}

/**
 * Registra a modalidade que o OPERADOR leu no anúncio.
 *
 * Nunca toca `remote_type`: o que o adapter afirmou fica intacto, e a divergência
 * entre os dois é dado, não conflito. `state` null limpa a confirmação (desfaz um
 * erro de digitação sem precisar de SQL na mão).
 */
export function confirmModality(
  id: string,
  state: AssertedModality | null,
  note: string | null = null
): void {
  getDb()
    .prepare(
      `UPDATE jobs SET modality_confirmed = ?, modality_confirmed_at = ?, modality_note = ?
        WHERE id = ?`
    )
    .run(state, state ? nowIso() : null, state ? note : null, id);
}

/**
 * Vagas vivas na fila — `queued` e ainda SEM linha em `applications`.
 *
 * É esta a contagem que o operador vê como "a fila": `status = 'queued'` sozinho
 * inclui as vagas que já viraram kit (a linha em `jobs` continua `queued` enquanto
 * o funil vive em `applications`), e por isso devolve um número maior que o do
 * `rescore`. Duas contagens diferentes para a mesma palavra é como se descobre
 * tarde que se estava lendo a tabela errada.
 */
export function listOpenQueueJobs(): JobRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM jobs
        WHERE status = 'queued'
          AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id)
        ORDER BY score DESC`
    )
    .all() as unknown as JobRow[];
}

/**
 * Grava o resultado de uma repontuação. `score_previous` só é escrito quando
 * ainda é NULL: ele guarda o score do momento do insert, não o da rodada
 * anterior — é o marco zero da baseline, e por isso rodar `rescore` duas vezes
 * produz exatamente o mesmo estado.
 */
export function updateJobRescore(
  id: string,
  score: number,
  detail: Record<string, number>,
  trackHint: string | null,
  policyAction: string,
  status: string,
  at: string,
  seniority: string | null
): void {
  getDb()
    .prepare(
      `UPDATE jobs
          SET score_previous    = COALESCE(score_previous, score),
              score             = ?,
              score_detail      = ?,
              track_hint        = ?,
              policy_action     = ?,
              status            = ?,
              score_rescored_at = ?,
              seniority         = ?
        WHERE id = ?`
    )
    .run(score, JSON.stringify(detail), trackHint, policyAction, status, at, seniority, id);
}
