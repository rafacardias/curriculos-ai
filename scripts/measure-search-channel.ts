/**
 * measure-search-channel — instrumenta o canal que ACHADO-11 (2026-08-10) identificou
 * como primário: a busca geral (`src/cli/search.ts` → Remotive/RemoteOK/WWR/Gupy
 * agregador/LinkedIn), não a vigilância por empresa.
 *
 * POR QUE ISSO EXISTE. A vigilância por empresa (Fase A) tem `ACHADO-11` com números
 * precisos (0,3%→0,49% de filtro, teto de score medido) porque cada rodada é uma
 * transação isolada e mensurável. A busca geral nunca foi instrumentada da mesma
 * forma — sabemos que ela produz vaga boa (score_detail já mostrou 93,3/84,4/82,2),
 * mas não em que taxa, nem se essa taxa é estável entre rodadas. Este script lê o
 * que já existe no banco (65 `search_runs` histórico, 2026-07-12→2026-08-09) e
 * reporta: vagas por rodada, quantas cruzam `queue_threshold`, distribuição de
 * `keyword_overlap`, e estabilidade entre a primeira e a segunda metade cronológica
 * das rodadas. NÃO dispara busca nova — é leitura pura do que já foi coletado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LIMITE DO QUE ESTE NÚMERO PROVA — leia antes de decidir qualquer coisa com ele.
 *
 * `jobs` não guarda o `search_runs.id` que a inseriu (sem FK) — só `per_source`
 * (found/new agregado por fonte, exato, direto de `search_runs`). Pra atribuir
 * SCORE por rodada, este script casa `jobs.seen_at` com a janela
 * `[started_at, finished_at]` de cada `search_runs` — aproximação por tempo, não
 * join exato. Jobs com `source IN ('gupy-watch', 'manual')` são excluídos do pool
 * antes da atribuição (não vêm de `search.ts`, então a aproximação nunca precisa
 * arriscar confundir canal). Uma vaga que caiu fora de toda janela (clock skew,
 * rodada interrompida sem `finished_at`) fica "não atribuída" — contada à parte,
 * nunca descartada silenciosamente.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   npx tsx scripts/measure-search-channel.ts [--json]
 */
import { parseArgs } from "node:util";
import { getDb } from "../src/db/client.js";
import { loadConfig } from "../src/core/config.js";

const { values } = parseArgs({ options: { json: { type: "boolean", default: false } } });

interface RunRow {
  id: string;
  mode: string;
  query: string | null;
  started_at: string;
  finished_at: string | null;
  per_source: string | null;
}
interface JobRow {
  id: string;
  source: string;
  title: string;
  company_name: string;
  score: number;
  score_detail: string | null;
  status: string;
  seen_at: string;
}

const db = getDb();
const threshold = loadConfig().queue_threshold;

const runs = db
  .prepare("SELECT id, mode, query, started_at, finished_at, per_source FROM search_runs ORDER BY started_at ASC")
  .all() as RunRow[];

const jobs = db
  .prepare(
    `SELECT id, source, title, company_name, score, score_detail, status, seen_at
     FROM jobs
     WHERE source NOT IN ('gupy-watch', 'manual') AND score IS NOT NULL
     ORDER BY seen_at ASC`
  )
  .all() as JobRow[];

function keywordOverlap(j: JobRow): number {
  if (!j.score_detail) return 0;
  try {
    return (JSON.parse(j.score_detail) as Record<string, number>).keyword_overlap ?? 0;
  } catch {
    return 0;
  }
}

function bucket(ko: number): string {
  if (ko <= 0) return "0";
  if (ko <= 20) return "1-20";
  if (ko <= 40) return "21-40";
  if (ko <= 60) return "41-60";
  return "61+";
}

// Atribuição por janela de tempo — best-effort, ver cabeçalho.
const runById = new Map(runs.map((r) => [r.id, { ...r, foundSum: 0, newSum: 0, matched: [] as JobRow[] }]));
let unattributed = 0;
for (const j of jobs) {
  const run = runs.find((r) => r.finished_at && j.seen_at >= r.started_at && j.seen_at <= r.finished_at);
  if (run) runById.get(run.id)!.matched.push(j);
  else unattributed++;
}

let totalFoundAgg = 0;
let totalNewAgg = 0;
for (const r of runs) {
  const per = r.per_source ? (JSON.parse(r.per_source) as Record<string, { found: number; new: number }>) : {};
  const entry = runById.get(r.id)!;
  for (const s of Object.values(per)) {
    entry.foundSum += s.found ?? 0;
    entry.newSum += s.new ?? 0;
  }
  totalFoundAgg += entry.foundSum;
  totalNewAgg += entry.newSum;
}

const crossed = jobs.filter((j) => j.status === "queued");
const distrib: Record<string, number> = { "0": 0, "1-20": 0, "21-40": 0, "41-60": 0, "61+": 0 };
for (const j of jobs) distrib[bucket(keywordOverlap(j))]!++;

// Estabilidade: metade cronológica das RODADAS (não dos jobs) — mesma lógica de
// comparação que ACHADO-11 usou pra 0,3%→0,49% (duas janelas de tempo, mesma métrica).
const mid = Math.floor(runs.length / 2);
function metaDaMetade(subset: RunRow[]): { runs: number; found: number; new: number; scored: number; crossed: number } {
  const ids = new Set(subset.map((r) => r.id));
  const entries = [...runById.values()].filter((e) => ids.has(e.id));
  const found = entries.reduce((a, e) => a + e.foundSum, 0);
  const novo = entries.reduce((a, e) => a + e.newSum, 0);
  const matched = entries.flatMap((e) => e.matched);
  return { runs: subset.length, found, new: novo, scored: matched.length, crossed: matched.filter((j) => j.status === "queued").length };
}
const metade1 = metaDaMetade(runs.slice(0, mid));
const metade2 = metaDaMetade(runs.slice(mid));

const out = {
  threshold,
  totalRuns: runs.length,
  totalFoundAgg,
  totalNewAgg,
  scoredPoolSize: jobs.length,
  unattributed,
  crossedThreshold: crossed.length,
  crossedPct: jobs.length ? Math.round((crossed.length / jobs.length) * 1000) / 10 : 0,
  keywordOverlapDistribution: distrib,
  estabilidade: {
    primeiraMetade: metade1,
    segundaMetade: metade2,
  },
  top10: [...jobs]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((j) => ({ title: j.title, company: j.company_name, source: j.source, score: j.score, status: j.status })),
};

if (values.json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`Leitura pura do histórico — nenhuma busca nova disparada.\n`);
  console.log(`Rodadas em search_runs: ${out.totalRuns}`);
  console.log(`Vagas encontradas (soma per_source, exato): ${out.totalFoundAgg}`);
  console.log(`Vagas novas (soma per_source, exato): ${out.totalNewAgg}`);
  console.log(`Pool pontuado atribuível a alguma rodada: ${out.scoredPoolSize} (${out.unattributed} fora de qualquer janela)`);
  console.log(`Cruzaram queue_threshold (${threshold}): ${out.crossedThreshold} (${out.crossedPct}%)`);
  console.log(`\nDistribuição de keyword_overlap:`);
  for (const [k, v] of Object.entries(distrib)) console.log(`  ${k.padStart(5)}: ${v}`);
  console.log(`\nEstabilidade — 1ª metade cronológica das rodadas vs. 2ª:`);
  for (const [label, m] of [["1ª metade", metade1], ["2ª metade", metade2]] as const) {
    const pct = m.scored ? Math.round((m.crossed / m.scored) * 1000) / 10 : 0;
    console.log(`  ${label}: ${m.runs} rodadas · ${m.found} encontradas · ${m.new} novas · ${m.scored} pontuadas · ${m.crossed} na fila (${pct}%)`);
  }
  console.log(`\nTop 10 por pontuação (todo o pool):`);
  for (const j of out.top10) {
    console.log(`  [${j.score.toFixed(1).padStart(5)}] ${j.title} @ ${j.company} · ${j.source} · ${j.status}`);
  }
}
