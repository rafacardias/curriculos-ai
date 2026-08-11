import { ulid } from "ulid";
import { getDb, nowIso } from "../db/client.js";
import { insertJob } from "../db/repo/jobs.js";
import type { JobSourceAdapter, SearchParams } from "../adapters/types.js";
import { applyClientSideFilters } from "./search-filters.js";
import type { RawJob } from "./types.js";

export interface SourceStats {
  /** Quantas a FONTE devolveu (antes do filtro cliente) — a série histórica. */
  found: number;
  new: number;
  errors: string[];
  /** Critério pedido que a fonte não resolveu e o filtro cliente não aplicou. */
  ignored: string[];
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
      // O timer precisa ser limpo: sem isso o Promise.race vencido pelo adapter
      // deixa um setTimeout de 30s vivo, segurando o event loop até o fim do prazo.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<{ jobs: RawJob[]; errors: string[] }>((resolve) => {
        timer = setTimeout(
          () => resolve({ jobs: [], errors: [`timeout ${ADAPTER_TIMEOUT_MS}ms`] }),
          ADAPTER_TIMEOUT_MS
        );
      });
      try {
        const result = await Promise.race([adapter.search(params), timeout]);
        return { adapterId: adapter.id, caps: adapter.capabilities, ...result };
      } catch (err) {
        return {
          adapterId: adapter.id,
          caps: adapter.capabilities,
          jobs: [] as RawJob[],
          errors: [String(err)],
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  for (const { adapterId, caps, jobs, errors, ignored: fromAdapter } of results) {
    // "pass": descartar vaga sem modalidade declarada seria o filtro inventando
    // um fato ("é presencial") a partir de ausência de dado — a mesma classe de
    // erro do BUG-007.
    const { kept, ignored } = applyClientSideFilters(jobs, params, caps, { unknownRemoteType: "pass" });
    const stats: SourceStats = {
      found: jobs.length,
      new: 0,
      errors,
      // Duas origens, um campo: o que a FONTE recebeu e não aplicou (ex.: a Gupy
      // só recorta por cidade e veio um país) e o que o filtro cliente não
      // aplicou. Para quem lê `per_source`, os dois são a mesma pergunta —
      // "o que eu pedi e não aconteceu?".
      ignored: [...(fromAdapter ?? []), ...ignored],
    };
    for (const raw of kept) {
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
