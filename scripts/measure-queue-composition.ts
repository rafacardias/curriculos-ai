/**
 * measure-queue-composition — composição da fila calibrada por trilha (`trackHint`),
 * mais a distribuição de score. Ferramenta do item 3 de `docs/roadmap.md` ("na fila
 * calibrada, 30 das 40 vagas são de `product` e 5 são de `ai-builder`").
 *
 * READ-ONLY, GARANTIDO. Nenhum INSERT/UPDATE/DELETE neste arquivo, nenhuma chamada
 * com `commit: true`. `rescoreAll(config, { commit: false })` (`src/core/scoring.ts:301`)
 * planeja e não escreve; `scoreJob` (`src/core/scoring.ts:69`) é puro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A REGRA QUE É O PONTO INTEIRO DESTE SCRIPT
 *
 * `jobs.track_hint` NUNCA é lido como fonte de verdade. Essa coluna é gravada por
 * `updateJobScore`/`updateJobRescore` e reflete N execuções de `rescore --commit`
 * em datas diferentes, cada uma sob pesos e léxicos de trilha possivelmente
 * distintos — exatamente o vetor do `ACHADO-16` (`KNOWN-BUGS.md`), onde a coluna
 * `status`/`score` armazenada se provou contaminada pela mesma causa (rescore
 * multi-data reescrevendo vagas antigas sob configs diferentes) e invalidou uma
 * medição anterior deste repo. `track_hint` é escrita pelo MESMO caminho de código
 * (`updateJobRescore`, `src/db/repo/jobs.ts:258`) e está exposta ao mesmo risco.
 *
 * O caminho honesto, usado aqui: recalcular do zero, hoje, sob o config ATUAL —
 * `scoreJob()` (usado tanto diretamente quanto por dentro de `rescoreAll`) — e
 * nunca ler a coluna armazenada exceto para MEDIR o tamanho da divergência
 * contra o valor recalculado (seção 4 do relatório).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DUAS RECOMPUTAÇÕES, DOIS ESCOPOS — leia antes de comparar os números:
 *
 *  - A "fila" (seções 2 e 5) vem de `rescoreAll(config, { commit: false }).all`,
 *    filtrado a `statusAfter === "queued"`. `rescoreAll` só repontua o que
 *    `listRescorableJobs()` retorna: `status IN ('new','queued','rejected')` SEM
 *    linha em `applications` (`src/db/repo/jobs.ts:182`). Uma vaga com kit gerado
 *    ou já candidatada não passa por aqui, mesmo que `jobs.status` ainda diga
 *    `queued` no banco — é o escopo que a própria função de rescore define como
 *    "fila calibrada", e é o mesmo escopo que `rescore --commit` usaria na prática.
 *
 *  - O "acervo inteiro" (seções 3 e 4) é a tabela `jobs` completa, sem filtro de
 *    status nem de `applications` — inclui `expired`, `applied_elsewhere` e vagas
 *    com candidatura em andamento. Para isto o script chama `scoreJob()`
 *    diretamente (não `rescoreAll`, que pularia essas linhas) sobre cada vaga, só
 *    para extrair o `trackHint` recalculado — não aplica filtro duro nem decide
 *    política, porque a pergunta aqui é "de que trilha é o acervo", não "o que
 *    entraria na fila".
 *
 *   npx tsx scripts/measure-queue-composition.ts [--json]
 */
import { parseArgs } from "node:util";
import { getDb } from "../src/db/client.js";
import { loadConfig } from "../src/core/config.js";
import { rescoreAll, scoreJob } from "../src/core/scoring.js";
import type { JobRow } from "../src/db/repo/jobs.js";

const { values } = parseArgs({
  options: {
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`measure-queue-composition — composição da fila calibrada por trilha (trackHint), read-only

  --json    imprime o relatório como JSON em vez de texto
  --help    mostra esta mensagem

Nunca lê jobs.track_hint como fonte de verdade — recalcula tudo via scoreJob()/
rescoreAll(commit: false). Ver o doc-comment no topo do arquivo para o porquê
(ACHADO-16, KNOWN-BUGS.md). Não escreve no banco em nenhuma circunstância.

  npx tsx scripts/measure-queue-composition.ts [--json]`);
  process.exit(0);
}

const NO_TRACK = "(sem trilha)";

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

/** Percentil por "nearest rank" sobre um array já ordenado ascendente. */
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

interface TrackCount {
  track: string;
  n: number;
  pct: number;
}

function composeByTrack(tracks: (string | null)[]): TrackCount[] {
  const counts = new Map<string, number>();
  for (const t of tracks) {
    const key = t ?? NO_TRACK;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = tracks.length;
  return [...counts.entries()]
    .map(([track, n]) => ({ track, n, pct: pct(n, total) }))
    .sort((a, b) => b.n - a.n);
}

interface ScoreStats {
  track: string;
  n: number;
  min: number;
  p50: number;
  p90: number;
  max: number;
}

function scoreStatsByTrack(entries: Array<{ track: string | null; score: number }>): ScoreStats[] {
  const byTrack = new Map<string, number[]>();
  for (const e of entries) {
    const key = e.track ?? NO_TRACK;
    const arr = byTrack.get(key) ?? [];
    arr.push(e.score);
    byTrack.set(key, arr);
  }
  const out: ScoreStats[] = [];
  for (const [track, scores] of byTrack) {
    const sorted = [...scores].sort((a, b) => a - b);
    out.push({
      track,
      n: sorted.length,
      min: sorted[0]!,
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      max: sorted[sorted.length - 1]!,
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

const config = loadConfig();
const db = getDb();

// ── Fila: plano de rescore (commit: false), filtrado a quem o plano recalculado
// coloca em `queued`. Escopo = `listRescorableJobs()`, ver cabeçalho.
const plan = rescoreAll(config, { commit: false });
const queue = plan.all.filter((c) => c.statusAfter === "queued");
const queueByTrack = composeByTrack(queue.map((c) => c.trackHint));
const queueScoreStats = scoreStatsByTrack(queue.map((c) => ({ track: c.trackHint, score: c.scoreAfter })));

// ── Acervo inteiro: toda a tabela `jobs`, `trackHint` recalculado via `scoreJob()`
// diretamente (não via `rescoreAll`, que pula `applications`/`expired`).
const allJobs = db.prepare("SELECT * FROM jobs").all() as unknown as JobRow[];
const acervoRecalculado = allJobs.map((job) => {
  const { trackHint } = scoreJob(config, job);
  return { id: job.id, storedTrackHint: job.track_hint, recalculatedTrackHint: trackHint };
});
const acervoByTrack = composeByTrack(acervoRecalculado.map((a) => a.recalculatedTrackHint));

// ── Comparação gravado × recalculado, acervo inteiro.
const mismatches = acervoRecalculado.filter((a) => a.storedTrackHint !== a.recalculatedTrackHint);
const mismatchBreakdown = new Map<string, number>();
for (const m of mismatches) {
  const key = `${m.storedTrackHint ?? NO_TRACK} → ${m.recalculatedTrackHint ?? NO_TRACK}`;
  mismatchBreakdown.set(key, (mismatchBreakdown.get(key) ?? 0) + 1);
}
const mismatchRows = [...mismatchBreakdown.entries()]
  .map(([transition, n]) => ({ transition, n }))
  .sort((a, b) => b.n - a.n);

const out = {
  queueTotal: queue.length,
  queueByTrack,
  queueScoreStats,
  acervoTotal: allJobs.length,
  acervoByTrack,
  mismatchTotal: mismatches.length,
  mismatchRows,
};

if (values.json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(
    "Trilha RECALCULADA via scoreJob() sob o config atual, nunca lida de jobs.track_hint — essa coluna é gravada por N execuções de `rescore --commit` em datas/pesos diferentes e está exposta à mesma contaminação que invalidou o ACHADO-15 (ver ACHADO-16, KNOWN-BUGS.md).\n"
  );

  console.log(`1. Composição da FILA (plano recalculado, statusAfter === "queued", escopo = listRescorableJobs()):`);
  console.log(`   total: ${out.queueTotal}`);
  for (const row of queueByTrack) {
    console.log(`   ${row.track}: ${row.n} (${row.pct}%)`);
  }

  console.log(`\n2. Composição do ACERVO INTEIRO (toda a tabela jobs, trilha recalculada, sem filtro de status/applications):`);
  console.log(`   total: ${out.acervoTotal}`);
  for (const row of acervoByTrack) {
    console.log(`   ${row.track}: ${row.n} (${row.pct}%)`);
  }

  console.log(`\n3. Comparação gravado × recalculado (acervo inteiro):`);
  if (out.mismatchTotal === 0) {
    console.log(`   0 divergências em ${out.acervoTotal} vagas — jobs.track_hint bate com o recálculo hoje.`);
  } else {
    console.log(`   ${out.mismatchTotal} de ${out.acervoTotal} vagas (${pct(out.mismatchTotal, out.acervoTotal)}%) têm track_hint gravado diferente do recalculado:`);
    for (const row of mismatchRows) {
      console.log(`   ${row.transition}: ${row.n}`);
    }
  }

  console.log(`\n4. Distribuição de score na fila, por trilha (min / p50 / p90 / max / n):`);
  if (!queueScoreStats.length) {
    console.log(`   fila vazia — sem distribuição a reportar.`);
  } else {
    for (const s of queueScoreStats) {
      console.log(`   ${s.track}: min=${s.min} p50=${s.p50} p90=${s.p90} max=${s.max} n=${s.n}`);
    }
  }

  console.log(`\nVagas sem trilha (trackHint null) aparecem como "${NO_TRACK}" acima — nunca somadas a uma trilha nomeada.`);
}
