import { ulid } from "ulid";
import { getDb, nowIso } from "../db/client.js";
import { insertJob } from "../db/repo/jobs.js";
import type { JobSourceAdapter, SearchParams } from "../adapters/types.js";
import type { RawJob } from "./types.js";

export interface SourceStats {
  found: number;
  new: number;
  errors: string[];
}

export interface SearchRunResult {
  runId: string;
  perSource: Record<string, SourceStats>;
  newJobIds: string[];
}

const ADAPTER_TIMEOUT_MS = 30000;

/**
 * Roda uma busca em N adapters em paralelo com isolamento de erro:
 * um adapter quebrado nunca derruba a execução — o erro vai para search_runs.
 */
export async function runSearch(
  adapters: JobSourceAdapter[],
  params: SearchParams,
  mode: "manual" | "auto"
): Promise<SearchRunResult> {
  const db = getDb();
  const runId = ulid();
  db.prepare("INSERT INTO search_runs (id, mode, query, started_at) VALUES (?, ?, ?, ?)").run(
    runId, mode, params.query, nowIso()
  );

  const perSource: Record<string, SourceStats> = {};
  const newJobIds: string[] = [];

  const results = await Promise.all(
    adapters.map(async (adapter) => {
      const timeout = new Promise<{ jobs: RawJob[]; errors: string[] }>((resolve) =>
        setTimeout(() => resolve({ jobs: [], errors: [`timeout ${ADAPTER_TIMEOUT_MS}ms`] }), ADAPTER_TIMEOUT_MS)
      );
      try {
        const result = await Promise.race([adapter.search(params), timeout]);
        return { adapterId: adapter.id, ...result };
      } catch (err) {
        return { adapterId: adapter.id, jobs: [] as RawJob[], errors: [String(err)] };
      }
    })
  );

  for (const { adapterId, jobs, errors } of results) {
    const stats: SourceStats = { found: jobs.length, new: 0, errors };
    for (const raw of jobs) {
      try {
        const inserted = insertJob(raw);
        if (inserted) {
          stats.new++;
          newJobIds.push(inserted.id);
        }
      } catch (err) {
        stats.errors.push(`insert '${raw.title}': ${String(err)}`);
      }
    }
    perSource[adapterId] = stats;
  }

  db.prepare("UPDATE search_runs SET finished_at = ?, per_source = ? WHERE id = ?").run(
    nowIso(), JSON.stringify(perSource), runId
  );
  return { runId, perSource, newJobIds };
}
