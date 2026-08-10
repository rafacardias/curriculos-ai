/**
 * Orquestrador da vigilância por empresa (Fase A).
 *
 * NÃO é `runSearch`/`JobSourceAdapter` — decisão registrada no plano da feature
 * e no KNOWN-BUGS.md. Reusa só a ponta de SAÍDA do pipeline: `RawJob` →
 * `insertJob` → `scoreNewJobs` (o MESMO scoring que a busca por termo usa,
 * nenhum caminho novo).
 *
 * Filtro léxico ANTES do insert: vaga que não bate com o léxico das trilhas
 * declaradas da empresa nunca vira `insertJob` — o filtro é grátis (regex,
 * sem I/O, sem LLM), então rechecar a mesma vaga rejeitada em todo poll não
 * tem custo real e não precisa de tabela de "vistos" (ver KNOWN-BUGS.md).
 *
 * Erro de UMA empresa nunca aborta o lote — cada empresa é isolada em
 * try/catch própria.
 *
 * `skipLexicalFilter` (opts) é uma via interna de MEDIÇÃO — nunca exposta em
 * `src/cli/watch.ts`. Serve só para `scripts/measure-watch-ceiling.ts` rodar
 * o mesmo fetch+dedup+score reais sem o corte léxico, dentro do mesmo
 * dry-run com rollback, e medir quantas vagas hoje descartadas cruzariam o
 * `queue_threshold`.
 */
import { getDb } from "../db/client.js";
import { transaction } from "../db/client.js";
import { loadCompaniesConfig, type CompanyWatch } from "./companies-config.js";
import {
  fetchGupyCompanyJobs,
  type CompanyFetchResult,
  type ModalityDistribution,
} from "../adapters/company-gupy.js";
import { insertJob } from "../db/repo/jobs.js";
import { scoreNewJobs, type ScoredJob } from "./scoring.js";
import { termsPresent } from "./keywords.js";
import { loadConfig } from "./config.js";
import type { RawJob } from "./types.js";

export interface CompanyWatchOutcome {
  company: string;
  handle: string;
  found: number;
  filteredOut: number;
  inserted: number;
  error: string | null;
  modalityStats: ModalityDistribution;
}

export interface WatchRunResult {
  commit: boolean;
  outcomes: CompanyWatchOutcome[];
  scored: ScoredJob[];
}

/** Sinaliza rollback intencional — nunca deve escapar de `runCompanyWatch`. */
class DryRunAbort extends Error {}

/** União das keywords das trilhas declaradas — reusa profile_tracks, sem léxico novo. */
function trackKeywords(trackIds: string[]): string[] {
  if (!trackIds.length) return [];
  const db = getDb();
  const placeholders = trackIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT keywords FROM profile_tracks WHERE enabled = 1 AND id IN (${placeholders})`)
    .all(...trackIds) as Array<{ keywords: string }>;
  const set = new Set<string>();
  for (const r of rows) for (const kw of JSON.parse(r.keywords) as string[]) set.add(kw);
  return [...set];
}

async function fetchForCompany(company: CompanyWatch): Promise<CompanyFetchResult> {
  if (company.ats === "gupy") return fetchGupyCompanyJobs(company.handle);
  // Zod já barra `ats` desconhecido no load do YAML — isto é defesa em
  // profundidade, não caminho esperado.
  throw new Error(`ATS não suportado por company-watch.ts: ${company.ats}`);
}

interface CompanyFetchOutcome {
  company: CompanyWatch;
  passed: RawJob[];
  found: number;
  filteredOut: number;
  error: string | null;
  modalityStats: ModalityDistribution;
}

/**
 * `commit=false` (default) roda a coleta e o filtro de verdade, e passa pelo
 * MESMO `insertJob`/`scoreNewJobs` do caminho real — mas dentro de uma
 * transação que sempre reverte, então o preview reflete dedup e score de
 * verdade sem escrever nada. `commit=true` aplica.
 */
export async function runCompanyWatch(
  opts: { companyHandle?: string; commit?: boolean; skipLexicalFilter?: boolean } = {}
): Promise<WatchRunResult> {
  const commit = opts.commit === true;
  const config = loadConfig();
  const companies = loadCompaniesConfig().filter(
    (c) => c.enabled && (!opts.companyHandle || c.handle === opts.companyHandle)
  );

  // Fase assíncrona (rede): nunca dentro de uma transação SQLite — não segura
  // o banco preso esperando HTTP, e better-sqlite3 é síncrono mesmo.
  const perCompany: CompanyFetchOutcome[] = [];
  for (const company of companies) {
    try {
      const { jobs, error, modalityStats } = await fetchForCompany(company);
      if (error) {
        perCompany.push({ company, passed: [], found: 0, filteredOut: 0, error, modalityStats });
        continue;
      }
      const keywords = trackKeywords(company.tracks);
      const passed: RawJob[] = [];
      let filteredOut = 0;
      for (const raw of jobs) {
        const text = `${raw.title} ${raw.description ?? ""}`;
        const wouldFilter = keywords.length > 0 && termsPresent(text, keywords).length === 0;
        if (wouldFilter) filteredOut++;
        if (wouldFilter && !opts.skipLexicalFilter) continue;
        passed.push(raw);
      }
      perCompany.push({ company, passed, found: jobs.length, filteredOut, error: null, modalityStats });
    } catch (err) {
      perCompany.push({
        company,
        passed: [],
        found: 0,
        filteredOut: 0,
        error: String(err),
        modalityStats: { remote: 0, hybrid: 0, onsite: 0, none: 0 },
      });
    }
  }

  // Fase síncrona (banco): grava de verdade, ou simula via rollback.
  const outcomes: CompanyWatchOutcome[] = [];
  const newJobIds: string[] = [];
  let scored: ScoredJob[] = [];

  const write = () => {
    for (const p of perCompany) {
      let inserted = 0;
      for (const raw of p.passed) {
        const row = insertJob(raw);
        if (row) {
          inserted++;
          newJobIds.push(row.id);
        }
      }
      outcomes.push({
        company: p.company.name,
        handle: p.company.handle,
        found: p.found,
        filteredOut: p.filteredOut,
        inserted,
        error: p.error,
        modalityStats: p.modalityStats,
      });
    }
    scored = scoreNewJobs(config, newJobIds);
  };

  if (commit) {
    write();
  } else {
    try {
      transaction(() => {
        write();
        throw new DryRunAbort();
      });
    } catch (err) {
      if (!(err instanceof DryRunAbort)) throw err;
    }
  }

  return { commit, outcomes, scored };
}
