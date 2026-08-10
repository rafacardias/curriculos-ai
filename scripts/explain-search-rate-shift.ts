/**
 * explain-search-rate-shift — por que a taxa de cruzamento de `queue_threshold` subiu
 * de 2,8% pra 21,5% entre as duas metades cronológicas medidas em `ACHADO-15`
 * (`scripts/measure-search-channel.ts`).
 *
 * POR QUE ISSO EXISTE. A hipótese original tinha três candidatos: query nova em
 * `config.yaml` (item 3 do roadmap), mistura de fonte, ou deriva de léxico/perfil.
 * Investigação achou DOIS confounds que nenhuma das três cobria:
 *
 *   1. `d23b6e2` 2026-08-06T19:09:48Z — `scoring.preference` 0.10→0,
 *      `keyword_overlap` 0.55→0.65. `e57feb1` 2026-08-06T20:00:35Z, 51 min depois —
 *      `searches:` retargetadas de QA/Product pra ai-builder. Nenhuma rodada de
 *      busca aconteceu entre os dois commits (checado: 0 jobs com `seen_at` na
 *      janela) — comparar "antes vs depois" por `seen_at` não distingue peso de
 *      query, os dois mudam junto.
 *   2. `rescore --commit` rodou em 2026-08-06, 08-07 E 08-08 (`docs/baseline-
 *      onda1.md`, `KNOWN-BUGS.md`), e `listRescorableJobs()` (`jobs.ts:182`)
 *      reprocessa `status IN ('new','queued','rejected')` sem `applications` —
 *      ENTÃO A COLUNA `jobs.score`/`status` de vagas antigas não representativa
 *      dos pesos que estavam valendo quando a vaga foi originalmente vista:
 *      uma fração (as não-`expired`, não-aplicadas) foi reescrita pelos rescores
 *      subsequentes, misturando até 3 configs diferentes por vaga dependendo de
 *      quando cada rescore rodou. Confirmado: a taxa de cruzamento "real" do pool
 *      anterior ao corte (0,3%) e a taxa simulada sob os pesos atuais pro MESMO
 *      pool (45,8%) divergem demais pra serem a mesma coisa — a coluna `status`
 *      armazenada está contaminada.
 *
 * Léxico/perfil (terceiro candidato original) foi DESCARTADO por verificação
 * direta: `profile/tracks.yaml` (fonte versionada) não tem commit desde
 * 2026-07-12, `git diff`/`git status` no arquivo estão limpos hoje — o
 * `profile_tracks.updated_at = 2026-08-08` no banco é o carimbo de um re-sync
 * idempotente (`ingest-profile.ts sync` sempre escreve `updated_at`, mesmo sem
 * mudança de conteúdo — `src/cli/ingest-profile.ts:67`), não uma edição real.
 *
 * O QUE ESTE SCRIPT FAZ, dado os dois problemas acima: ignora a coluna
 * `status`/`score` ARMAZENADA inteiramente (contaminada por rescore) e recalcula
 * os DOIS lados via `scoreJob()` + `hardFilterReason()` (ambos puros, só leitura)
 * — cada vaga real (imutável: título/descrição/empresa não mudam com o tempo) é
 * pontuada sob os pesos VELHOS e sob os pesos NOVOS, nos dois pools (selecionado
 * por query velha × selecionado por query nova). 2×2 limpo, sem depender de
 * quando ou quantas vezes aquela vaga específica foi rescorada.
 *
 * A composição de fonte é reportada à parte — `source` não é termo da fórmula de
 * `scoreJob` (só existia como `preference_weights` aprendido, já neutralizado),
 * então um efeito de fonte só pode ser composicional, não uma causa direta.
 *
 * LIMITE: a simulação de `preference` usa `preference_weights` da tabela ATUAL
 * (poucos eventos `tema` mudaram isso desde 2026-08-06 — efeito pequeno, não
 * corrigido). `filters.*` (elegibilidade, idioma nativo) também mudou em
 * 2026-08-07 (commits `8441497`, `5a71d09`) — este script usa os filtros ATUAIS
 * nos dois lados da simulação, isolando só `keyword_overlap`/`preference`; a
 * evolução dos filtros não é objeto desta medição.
 *
 *   npx tsx scripts/explain-search-rate-shift.ts [--json]
 */
import { parseArgs } from "node:util";
import { getDb } from "../src/db/client.js";
import { loadConfig, type AppConfig } from "../src/core/config.js";
import { scoreJob, hardFilterReason } from "../src/core/scoring.js";
import { getJob } from "../src/db/repo/jobs.js";

const { values } = parseArgs({ options: { json: { type: "boolean", default: false } } });

// Commit e57feb1 (query retarget), convertido pra UTC. Nenhuma rodada de busca
// ocorreu entre ele e o commit de peso anterior (d23b6e2) — checado.
const SPLIT_AT = "2026-08-06T20:00:35.000Z";

const newConfig = loadConfig();
const oldConfig: AppConfig = {
  ...newConfig,
  scoring: { ...newConfig.scoring, keyword_overlap: 0.55, preference: 0.1 },
};

const db = getDb();
const threshold = newConfig.queue_threshold;

interface Row {
  id: string;
  source: string;
  seen_at: string;
}

const preRows = db
  .prepare(
    `SELECT id, source, seen_at FROM jobs
     WHERE source NOT IN ('gupy-watch', 'manual') AND score IS NOT NULL AND seen_at < ?
     ORDER BY seen_at ASC`
  )
  .all(SPLIT_AT) as Row[];
const postRows = db
  .prepare(
    `SELECT id, source, seen_at FROM jobs
     WHERE source NOT IN ('gupy-watch', 'manual') AND score IS NOT NULL AND seen_at >= ?
     ORDER BY seen_at ASC`
  )
  .all(SPLIT_AT) as Row[];

function sourceMix(rows: Row[]): Record<string, number> {
  const mix: Record<string, number> = {};
  for (const r of rows) mix[r.source] = (mix[r.source] ?? 0) + 1;
  return mix;
}

/** Recalcula do zero — nunca lê `jobs.score`/`status` armazenado (contaminado por rescore). */
function simulate(rows: Row[], simConfig: AppConfig): { crossed: number; n: number } {
  let crossed = 0;
  let n = 0;
  for (const r of rows) {
    const job = getJob(r.id);
    if (!job) continue;
    n++;
    const { score } = scoreJob(simConfig, job);
    const filtered = hardFilterReason(simConfig, job);
    if (!filtered && score >= threshold) crossed++;
  }
  return { crossed, n };
}

function pct(crossed: number, n: number): number {
  return n ? Math.round((crossed / n) * 1000) / 10 : 0;
}

const preOld = simulate(preRows, oldConfig);
const preNew = simulate(preRows, newConfig);
const postOld = simulate(postRows, oldConfig);
const postNew = simulate(postRows, newConfig);

const out = {
  splitAt: SPLIT_AT,
  threshold,
  cells: {
    "query velha × peso velho": { n: preOld.n, crossed: preOld.crossed, pct: pct(preOld.crossed, preOld.n) },
    "query velha × peso novo": { n: preNew.n, crossed: preNew.crossed, pct: pct(preNew.crossed, preNew.n) },
    "query nova × peso velho": { n: postOld.n, crossed: postOld.crossed, pct: pct(postOld.crossed, postOld.n) },
    "query nova × peso novo": { n: postNew.n, crossed: postNew.crossed, pct: pct(postNew.crossed, postNew.n) },
  },
  pesoEffectSobQueryVelha: pct(preNew.crossed, preNew.n) - pct(preOld.crossed, preOld.n),
  pesoEffectSobQueryNova: pct(postNew.crossed, postNew.n) - pct(postOld.crossed, postOld.n),
  queryEffectSobPesoVelho: pct(postOld.crossed, postOld.n) - pct(preOld.crossed, preOld.n),
  queryEffectSobPesoNovo: pct(postNew.crossed, postNew.n) - pct(preNew.crossed, preNew.n),
  sourceMixPre: sourceMix(preRows),
  sourceMixPost: sourceMix(postRows),
};

if (values.json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`Corte: ${SPLIT_AT} — simulação pura via scoreJob()+hardFilterReason(), coluna status/score armazenada IGNORADA (contaminada por rescore).\n`);
  console.log("Decomposição 2×2:");
  for (const [label, c] of Object.entries(out.cells)) {
    console.log(`  ${label}: n=${c.n} · cruzariam ${c.crossed} (${c.pct}%)`);
  }
  console.log(`\nEfeito do PESO (0.55/0.10 → 0.65/0):`);
  console.log(`  sob query velha: ${out.pesoEffectSobQueryVelha >= 0 ? "+" : ""}${out.pesoEffectSobQueryVelha}pp`);
  console.log(`  sob query nova:  ${out.pesoEffectSobQueryNova >= 0 ? "+" : ""}${out.pesoEffectSobQueryNova}pp`);
  console.log(`Efeito da QUERY (retargetada pra ai-builder):`);
  console.log(`  sob peso velho: ${out.queryEffectSobPesoVelho >= 0 ? "+" : ""}${out.queryEffectSobPesoVelho}pp`);
  console.log(`  sob peso novo:  ${out.queryEffectSobPesoNovo >= 0 ? "+" : ""}${out.queryEffectSobPesoNovo}pp`);
  console.log(`\nMistura de fonte — antes:`);
  for (const [s, n] of Object.entries(out.sourceMixPre)) console.log(`  ${s}: ${n} (${pct(n, preRows.length)}%)`);
  console.log(`Mistura de fonte — depois:`);
  for (const [s, n] of Object.entries(out.sourceMixPost)) console.log(`  ${s}: ${n} (${pct(n, postRows.length)}%)`);
}
