-- Schema portável: TEXT ids (ulid), datas ISO-8601, JSON em TEXT.
-- Sem features exclusivas de SQLite no core — migra para Postgres/Supabase.

CREATE TABLE companies (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  name_normalized   TEXT NOT NULL UNIQUE,
  domain            TEXT,
  industry          TEXT,
  notes             TEXT,               -- tom de outreach que funcionou, contatos, contexto
  applications_count INTEGER NOT NULL DEFAULT 0,
  responses_count   INTEGER NOT NULL DEFAULT 0,
  interviews_count  INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE jobs (
  id               TEXT PRIMARY KEY,
  fingerprint      TEXT NOT NULL UNIQUE,   -- hash: norm(company)+norm(title)+norm(location)
  source           TEXT NOT NULL,          -- gupy|remotive|remoteok|wwr|linkedin|manual
  source_job_id    TEXT,
  url              TEXT NOT NULL,
  title            TEXT NOT NULL,
  company_id       TEXT REFERENCES companies(id),
  company_name     TEXT NOT NULL,          -- denormalizado para exibição rápida
  location         TEXT,
  remote_type      TEXT,                   -- remote|hybrid|onsite
  salary_raw       TEXT,
  description      TEXT,                   -- texto extraído do JD
  raw_html         TEXT,                   -- HTML bruto para auditoria/reprocessamento
  jd_snapshot_path TEXT,                   -- cópia em disco do JD original
  language         TEXT,                   -- pt|en
  seniority        TEXT,
  ats_platform     TEXT,                   -- greenhouse|lever|workday|gupy|linkedin|other
  posted_at        TEXT,
  seen_at          TEXT NOT NULL,
  score            REAL,
  score_detail     TEXT,                   -- JSON: contribuições de cada componente
  track_hint       TEXT,
  policy_action    TEXT,                   -- ação recomendada pelo policy engine
  status           TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','queued','rejected','expired','applied_elsewhere'))
);
CREATE INDEX idx_jobs_status_score ON jobs(status, score DESC);
CREATE INDEX idx_jobs_company ON jobs(company_id);

CREATE TABLE profile_tracks (
  id        TEXT PRIMARY KEY,             -- ex.: 'marketing', 'ops', 'tech'
  name      TEXT NOT NULL,
  summary   TEXT,
  keywords  TEXT NOT NULL DEFAULT '[]',   -- JSON array: léxico de skills da trilha
  updated_at TEXT NOT NULL
);

CREATE TABLE candidate_facts (
  key        TEXT NOT NULL,               -- work_authorization, salary_expectation_brl, notice_period...
  language   TEXT NOT NULL DEFAULT 'pt',
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (key, language)
);

CREATE TABLE applications (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES jobs(id),
  track_id        TEXT REFERENCES profile_tracks(id),
  status          TEXT NOT NULL DEFAULT 'kit_ready'
                  CHECK (status IN ('kit_ready','submitting','applied','screening','interview','offer','rejected','withdrawn','ghosted')),
  applied_at      TEXT,
  kit_dir         TEXT,
  submission_mode TEXT,                   -- review_first|approve_batch|full_auto|manual
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_job ON applications(job_id);

CREATE TABLE resume_versions (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  version        INTEGER NOT NULL DEFAULT 1,
  resume_md_path TEXT,
  resume_pdf_path TEXT,
  variant        TEXT,                    -- JSON: escolhas do experiment engine (headline, summary, ordering)
  keyword_report TEXT,                    -- JSON: {jd_keywords, covered, missing, coverage_pct, ats_score_heuristic}
  truthcheck     TEXT,                    -- JSON: bullets → fact_ids citados + resultado da validação
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_resume_versions_app ON resume_versions(application_id);

CREATE TABLE answer_bank (
  id                   TEXT PRIMARY KEY,
  question_fingerprint TEXT NOT NULL,     -- texto normalizado da pergunta
  question_text        TEXT NOT NULL,
  answer               TEXT NOT NULL,
  language             TEXT NOT NULL DEFAULT 'pt',
  track_id             TEXT REFERENCES profile_tracks(id),
  company_id           TEXT REFERENCES companies(id),
  times_used           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX idx_answer_bank_fp ON answer_bank(question_fingerprint, language);

CREATE TABLE submissions (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  adapter        TEXT NOT NULL,           -- greenhouse|lever|workday|linkedin-easyapply
  mode           TEXT NOT NULL CHECK (mode IN ('review_first','approve_batch','full_auto')),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','filled','awaiting_user','submitted','failed')),
  pending_question TEXT,                  -- pergunta que pausou a submissão (awaiting_user)
  receipt_path   TEXT,
  error          TEXT,
  started_at     TEXT,
  finished_at    TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_submissions_status ON submissions(status);

CREATE TABLE events (
  id         TEXT PRIMARY KEY,
  entity     TEXT NOT NULL,               -- job|application|submission|policy|search
  entity_id  TEXT NOT NULL,
  type       TEXT NOT NULL,               -- status_change|feedback_approve|feedback_reject|note|search_found|policy_decision
  payload    TEXT,                        -- JSON
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_entity ON events(entity, entity_id);

CREATE TABLE preference_weights (
  key        TEXT PRIMARY KEY,            -- kw:react | company:acme | seniority:senior | source:gupy
  weight     REAL NOT NULL DEFAULT 0,     -- bônus/penalidade aditiva, com cap e decay
  updated_at TEXT NOT NULL
);

CREATE TABLE search_runs (
  id          TEXT PRIMARY KEY,
  mode        TEXT NOT NULL CHECK (mode IN ('manual','auto')),
  query       TEXT,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  per_source  TEXT                        -- JSON: {gupy:{found,new,errors:[...]}, ...}
);
