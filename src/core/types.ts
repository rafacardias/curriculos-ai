// Tipos de domínio — este módulo não conhece CLI nem Claude Code.

// "<ats>-watch" é o padrão de proveniência da vigilância por empresa (Fase A) —
// mesmo ATS, caminho de descoberta diferente da busca por termo. Ver
// src/core/company-watch.ts e KNOWN-BUGS.md (decisão de não reaproveitar "gupy").
export type JobSource = "gupy" | "remotive" | "remoteok" | "wwr" | "linkedin" | "manual" | "gupy-watch";
export type AtsPlatform = "greenhouse" | "lever" | "workday" | "gupy" | "linkedin" | "other";
export type RemoteType = "remote" | "hybrid" | "onsite";
export type JobStatus = "new" | "queued" | "rejected" | "expired" | "applied_elsewhere";
// `submitting` existia aqui e NADA no sistema o escrevia — resto do caminho de
// submissão automatizada que nunca chegou a usá-lo. Tipo que descreve estado
// inexistente é a mesma classe de erro em outra camada: ele apareceu numa
// exclusão de contagem (`status NOT IN ('kit_ready','submitting')`) e fez parecer
// que havia um estado intermediário sendo tratado. Não havia.
// A submissão em andamento vive em `submissions.status = 'pending'`.
export type ApplicationStatus =
  | "kit_ready"
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "ghosted";
export type SubmissionMode = "review_first" | "approve_batch" | "full_auto";
export type SubmissionStatus = "pending" | "filled" | "awaiting_user" | "submitted" | "failed";

/** Vaga crua retornada por um JobSourceAdapter, antes de normalizar/pontuar. */
export interface RawJob {
  source: JobSource;
  sourceJobId?: string;
  url: string;
  title: string;
  companyName: string;
  location?: string;
  remoteType?: RemoteType;
  salaryRaw?: string;
  description?: string;
  rawHtml?: string;
  language?: "pt" | "en";
  postedAt?: string; // ISO-8601
}

export interface Job extends RawJob {
  id: string;
  fingerprint: string;
  companyId?: string;
  seniority?: string;
  atsPlatform?: AtsPlatform;
  seenAt: string;
  score?: number;
  scoreDetail?: Record<string, number>;
  trackHint?: string;
  policyAction?: string;
  status: JobStatus;
}

export interface ProfileTrack {
  id: string;
  name: string;
  summary?: string;
  keywords: string[];
}

/** Fato atômico e verificável do perfil mestre — a unidade citável [exp:ID]. */
export interface ProfileFact {
  id: string;
  text: string;
  skills: string[];
}

export interface Experience {
  id: string;
  company: string;
  role: string;
  start?: string;
  end?: string;
  trackTags: string[];
  facts: ProfileFact[];
}

export interface MasterProfile {
  identity: {
    name: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    languages?: string[];
  };
  experiences: Experience[];
  education: Array<{ institution: string; degree: string; start?: string; end?: string }>;
  certifications: string[];
  skills: { hard: string[]; soft: string[]; tools: string[] };
}
