/**
 * Leitura do histórico de `search_runs` — saúde por fonte.
 *
 * O erro de um adapter já era gravado em `per_source` (ver src/core/pipeline.ts),
 * mas só a última corrida era lida: uma fonte podia ficar em timeout por várias
 * buscas seguidas sem que isso virasse alerta — foi o que houve com o LinkedIn
 * em 2026-07-13 (4 corridas seguidas em timeout, queda e volta despercebidas).
 * Aqui o histórico é lido para separar a falha isolada (ruído) da fonte morta.
 *
 * Regra dura: a fonte só "falha" numa corrida em que ela PARTICIPOU. Corrida em
 * que a chave nem aparece no `per_source` é ausência — não conta nem como falha
 * nem como sucesso, e não quebra a sequência.
 */
import { getDb } from "../client.js";

/** Forma gravada por `runSearch` em `search_runs.per_source`. */
interface PerSourceStats {
  found: number;
  new: number;
  errors: string[];
}

export interface SourceHealth {
  source: string;
  /** Falhas seguidas contando da corrida mais recente em que a fonte participou. */
  consecutiveFailures: number;
  /** Em quantas das últimas N corridas a fonte participou. */
  runsParticipated: number;
  /** Erros da falha mais recente, juntados; null quando a fonte não está falhando. */
  lastError: string | null;
  /** `started_at` da corrida mais recente em que a fonte rodou sem erro; null se nunca. */
  lastOkAt: string | null;
}

/**
 * Janela varrida apenas para achar o último sucesso — responder "há quanto tempo
 * não funciona" exige olhar mais para trás do que a janela de falhas consecutivas.
 */
const OK_LOOKBACK_RUNS = 50;

/** A partir de quantas falhas seguidas a fonte é considerada morta. */
export const DEAD_SOURCE_MIN_FAILURES = 2;

interface ParsedRun {
  startedAt: string;
  perSource: Record<string, PerSourceStats>;
}

function parsePerSource(raw: string | null): Record<string, PerSourceStats> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, PerSourceStats>) : null;
  } catch {
    // JSON corrompido é corrida sem informação, não corrida com falha.
    return null;
  }
}

function failed(stats: PerSourceStats | undefined): boolean {
  return !!stats && Array.isArray(stats.errors) && stats.errors.length > 0;
}

/**
 * Saúde de cada fonte vista nas últimas `lastN` corridas (read-only).
 * Ordenada por falhas consecutivas (desc) e depois pelo nome da fonte.
 */
export function getSourceHealth(lastN = 3): SourceHealth[] {
  const rows = getDb()
    .prepare(
      `SELECT started_at, per_source FROM search_runs
        WHERE per_source IS NOT NULL
        ORDER BY started_at DESC
        LIMIT ?`
    )
    .all(Math.max(lastN, OK_LOOKBACK_RUNS)) as unknown as {
    started_at: string;
    per_source: string | null;
  }[];

  const runs: ParsedRun[] = [];
  for (const r of rows) {
    const perSource = parsePerSource(r.per_source);
    if (perSource) runs.push({ startedAt: r.started_at, perSource });
  }

  const window = runs.slice(0, lastN);
  const sources = [...new Set(window.flatMap((r) => Object.keys(r.perSource)))];

  return sources
    .map((source) => {
      let consecutiveFailures = 0;
      let runsParticipated = 0;
      let lastError: string | null = null;
      let streakOpen = true;
      for (const run of window) {
        const stats = run.perSource[source];
        if (!stats) continue; // ausência da fonte na corrida ≠ falha
        runsParticipated++;
        if (!streakOpen) continue;
        if (!failed(stats)) {
          streakOpen = false; // sucesso mais recente encerra a sequência
          continue;
        }
        consecutiveFailures++;
        lastError ??= stats.errors.join("; ");
      }
      const okRun = runs.find((r) => r.perSource[source] && !failed(r.perSource[source]));
      return {
        source,
        consecutiveFailures,
        runsParticipated,
        lastError,
        lastOkAt: okRun?.startedAt ?? null,
      } satisfies SourceHealth;
    })
    .sort((a, b) => b.consecutiveFailures - a.consecutiveFailures || a.source.localeCompare(b.source));
}

/**
 * Fontes mortas: falharam em `DEAD_SOURCE_MIN_FAILURES`+ das últimas `lastN`
 * corridas em que participaram, sem sucesso nenhum depois disso. Falha isolada
 * fica de fora de propósito — ela já aparece no aviso da última corrida.
 */
export function listDeadSources(lastN = 3): SourceHealth[] {
  return getSourceHealth(lastN).filter((s) => s.consecutiveFailures >= DEAD_SOURCE_MIN_FAILURES);
}
