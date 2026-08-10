/**
 * measure-watch-ceiling — mede quantas vagas hoje descartadas pelo filtro léxico
 * (título+departamento, ver ACHADO-11) cruzariam o `queue_threshold` se fossem
 * inseridas e pontuadas mesmo assim.
 *
 * POR QUE ISSO EXISTE. `watch run --commit` (2026-08-09) mediu que, das 9 vagas
 * que PASSARAM o filtro, 6 eram novas e NENHUMA cruzou o threshold de 40 (melhor:
 * 31,8). Isso não decide "filtrar vs. inserir tudo" — não sabemos quantas das
 * ~1819 vagas que o filtro BARROU teriam pontuado acima de 40, porque elas nunca
 * chegam a `scoreJob`. Este script responde isso sem esse risco: reusa o dry-run
 * já existente de `runCompanyWatch` (`commit: false`, rollback garantido via
 * `DryRunAbort`) com `skipLexicalFilter: true` — mesmo fetch real, mesmo
 * `insertJob`/`scoreNewJobs` reais, só sem o corte léxico. Nada é escrito no
 * banco de produção.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LIMITE DO QUE ESTE NÚMERO PROVA — leia antes de decidir qualquer coisa com ele.
 *
 * Mede o teto sob o `queue_threshold` e os pesos de `scoreJob` ATUAIS, num único
 * poll. Não simula o custo de armazenamento de "inserir tudo" a cada poll diário
 * (esse trade-off — volume no banco vs. poluição da fila — está registrado em
 * ACHADO-11, não é recalculado aqui). Só responde: "quantas vagas que cruzariam
 * o corte o filtro léxico está descartando agora".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   npx tsx scripts/measure-watch-ceiling.ts [--json]
 */
import { parseArgs } from "node:util";
import { runCompanyWatch } from "../src/core/company-watch.js";

const { values } = parseArgs({ options: { json: { type: "boolean", default: false } } });

// Sem --company: cadastro inteiro. Sem --commit (default false): dry-run garantido.
const r = await runCompanyWatch({ skipLexicalFilter: true });

let totalFound = 0;
let totalWouldFilter = 0;
const erros: string[] = [];
for (const o of r.outcomes) {
  if (o.error) {
    erros.push(`${o.company} (${o.handle}): ${o.error}`);
    continue;
  }
  totalFound += o.found;
  totalWouldFilter += o.filteredOut;
}

const queued = r.scored.filter((s) => s.status === "queued");
const sorted = [...r.scored].sort((a, b) => b.score - a.score);

const out = {
  dryRun: !r.commit,
  totalFound,
  totalWouldFilter,
  scored: r.scored.length,
  crossedThreshold: queued.length,
  maxScore: sorted[0]?.score ?? 0,
  top10: sorted.slice(0, 10).map((s) => ({
    title: s.title,
    company: s.company,
    score: s.score,
    status: s.status,
  })),
  erros,
};

if (values.json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(out.dryRun ? "DRY-RUN — medição de teto, nada foi escrito.\n" : "AVISO — commit=true, isto não deveria acontecer neste script.\n");
  console.log(`Total de vagas buscadas: ${out.totalFound}`);
  console.log(`Barradas pelo filtro léxico (hoje): ${out.totalWouldFilter}`);
  console.log(`Pontuadas nesta rodada (novas, pós-dedup): ${out.scored}`);
  console.log(`Cruzaram queue_threshold: ${out.crossedThreshold}`);
  console.log(`Maior pontuação: ${out.maxScore.toFixed(1)}`);
  if (out.top10.length) {
    console.log("\nTop 10 por pontuação:");
    for (const j of out.top10) {
      console.log(`  [${j.score.toFixed(1).padStart(5)}] ${j.title} @ ${j.company} — ${j.status}`);
    }
  }
  if (erros.length) {
    console.log("\nErros por empresa:");
    for (const e of erros) console.log(`  ✖ ${e}`);
  }
}
