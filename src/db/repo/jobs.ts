import { ulid } from "ulid";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, nowIso, PROJECT_ROOT } from "../client.js";
import { jobFingerprint, detectAtsPlatform, detectSeniority } from "../../core/dedup.js";
import { upsertCompany } from "./companies.js";
import type { RawJob, JobSource } from "../../core/types.js";
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
  /**
   * Score baixo confirmado PELO OPERADOR — "eu sei que é abaixo do corte, quero
   * mesmo assim". Mesma lógica de proveniência de `modality_confirmed`: campo
   * separado do `score`, nunca sobrescreve o número calculado.
   */
  score_confirmed_at: string | null;
  score_confirmed_note: string | null;
}

const SNAPSHOT_DIR = join(PROJECT_ROOT, "output", "_jd-snapshots");

/**
 * Insere vaga nova; retorna null se já existe (dedup).
 *
 * Duas chaves de identidade, checadas nesta ordem:
 *  1. `(source, source_job_id)`, quando a fonte fornece um id nativo — sobrevive
 *     a reformulação de texto entre polls (vigilância por empresa relê o mesmo
 *     anúncio a cada 4-6h; `jobFingerprint` sozinho duplicaria se o título mudar
 *     uma vírgula). Ver `007_watch_dedup.sql`.
 *  2. `jobFingerprint` (companyName+title+location), o dedup CROSS-SOURCE — a
 *     mesma vaga vista pela busca por termo e pela vigilância continua
 *     colidindo mesmo com `source` diferente (`gupy` × `gupy-watch`).
 */
export function insertJob(raw: RawJob): JobRow | null {
  const db = getDb();
  if (raw.sourceJobId) {
    const bySourceId = db
      .prepare("SELECT id FROM jobs WHERE source = ? AND source_job_id = ?")
      .get(raw.source, raw.sourceJobId);
    if (bySourceId) return null;
  }
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
    score_confirmed_at: null,
    score_confirmed_note: null,
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

/**
 * Vaga já cadastrada com esta URL exata.
 *
 * `insertJob` não checa URL — só `(source, source_job_id)` e `jobFingerprint`
 * (companyName+title+location). Para o fallback `/vaga <url>` isso é o bug: a
 * UI instrui "reenvie a mesma URL preenchendo cargo e empresa" quando a
 * extração erra (título vira "?", empresa vira "?"), mas sem checagem por URL
 * cada reenvio virava uma vaga NOVA — mesmo link, N linhas em `jobs`, cada uma
 * com fingerprint diferente porque o texto corrigido muda o hash. `getJobByUrl`
 * é o que permite ao chamador decidir "isto é uma correção" em vez de inserir.
 */
export function getJobByUrl(url: string): JobRow | undefined {
  return getDb().prepare("SELECT * FROM jobs WHERE url = ?").get(url) as JobRow | undefined;
}

export type UpdateManualJobResult = { ok: true; job: JobRow } | { ok: false; collision: JobRow };

/**
 * Corrige título/empresa/descrição de uma vaga manual já cadastrada — o caminho
 * do reenvio de URL (ver `getJobByUrl`). Fingerprint é recalculado porque o
 * texto mudou; a URL, que é a chave de identidade do reenvio, não.
 *
 * `jobs.fingerprint` é `NOT NULL UNIQUE` (001_init.sql). Duas vagas manuais de
 * URLs diferentes, corrigidas pro MESMO cargo+empresa+localização, colidiriam
 * no UPDATE — pré-checa com `findExistingJob` (ignorando a própria linha) e
 * devolve a colisão nomeada em vez de deixar o `SqliteError` de constraint
 * subir cru pro operador.
 */
export function updateManualJobDetails(
  id: string,
  fields: { title?: string; companyName?: string; description?: string }
): UpdateManualJobResult | undefined {
  const db = getDb();
  const job = getJob(id);
  if (!job) return undefined;
  const title = fields.title ?? job.title;
  const companyName = fields.companyName ?? job.company_name;
  const description = fields.description ?? job.description ?? null;

  const collision = findExistingJob(
    {
      source: job.source as JobSource,
      sourceJobId: job.source_job_id ?? undefined,
      companyName,
      title,
      location: job.location ?? undefined,
    },
    id
  );
  if (collision) return { ok: false, collision };

  const company = upsertCompany(companyName);
  const fingerprint = jobFingerprint({ companyName, title, location: job.location ?? undefined });
  db.prepare(
    `UPDATE jobs SET title = ?, company_id = ?, company_name = ?, description = ?, seniority = ?, fingerprint = ?
       WHERE id = ?`
  ).run(title, company.id, companyName, description, detectSeniority(title) ?? null, fingerprint, id);
  return { ok: true, job: getJob(id)! };
}

/**
 * Vaga já existente que colide com `raw` — mesma checagem de 2 camadas do
 * `insertJob` (source_job_id, depois fingerprint), mas devolvendo a linha em
 * vez de um booleano. `insertJob` só precisa saber "existe ou não"; quem fala
 * com o operador (o fallback `/vaga <url>`) precisa dizer QUAL vaga é a
 * duplicata — "já existe" sem id é um beco sem saída para quem recebe o erro.
 *
 * `excludeId` ignora a própria linha — necessário quando quem chama está
 * corrigindo uma vaga já existente (`updateManualJobDetails`) e não quer que
 * ela colida consigo mesma.
 */
export function findExistingJob(
  raw: Pick<RawJob, "source" | "sourceJobId" | "companyName" | "title" | "location">,
  excludeId?: string
): JobRow | undefined {
  const db = getDb();
  if (raw.sourceJobId) {
    const bySourceId = db
      .prepare("SELECT * FROM jobs WHERE source = ? AND source_job_id = ?")
      .get(raw.source, raw.sourceJobId) as JobRow | undefined;
    if (bySourceId && bySourceId.id !== excludeId) return bySourceId;
  }
  const fingerprint = jobFingerprint(raw);
  const byFingerprint = db.prepare("SELECT * FROM jobs WHERE fingerprint = ?").get(fingerprint) as
    | JobRow
    | undefined;
  if (byFingerprint && byFingerprint.id !== excludeId) return byFingerprint;
  return undefined;
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
 * Registra que o OPERADOR quer gerar kit mesmo com score abaixo do corte.
 *
 * Nunca toca `score`: o número calculado fica intacto, a confirmação é uma decisão
 * em cima dele, não uma correção dele. `confirmed=false` limpa a confirmação.
 */
export function confirmScore(id: string, confirmed: boolean, note: string | null = null): void {
  getDb()
    .prepare(
      `UPDATE jobs SET score_confirmed_at = ?, score_confirmed_note = ?
        WHERE id = ?`
    )
    .run(confirmed ? nowIso() : null, confirmed ? note : null, id);
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
