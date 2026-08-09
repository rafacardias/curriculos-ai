/**
 * watch — vigilância de vagas por empresa cadastrada (Fase A, só Gupy).
 *
 *   npx tsx src/cli/watch.ts run                    # todas as empresas enabled, dry-run
 *   npx tsx src/cli/watch.ts run --commit            # aplica de verdade (grava, pontua)
 *   npx tsx src/cli/watch.ts run --company localiza  # só uma empresa
 *
 * Sem agendamento nesta fase — sob demanda. `--commit` é a exceção (mesmo
 * padrão de `rescore.ts`): o default planeja e não escreve.
 */
import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { PROJECT_ROOT, nowIso } from "../db/client.js";
import { runCompanyWatch, type WatchRunResult } from "../core/company-watch.js";
import { getJob } from "../db/repo/jobs.js";
import { resolveModality, modalityLabel } from "../core/modality.js";

const INBOX_PATH = join(PROJECT_ROOT, "output", "_watch", "inbox.md");

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h") || argv[0] !== "run") {
  console.log(`watch — vigilância de vagas por empresa cadastrada (config/companies.yaml)

  run                    roda o cadastro inteiro (default: dry-run, não escreve)
  run --commit           aplica de verdade — insere, pontua, registra em output/_watch/inbox.md
  run --company <handle> restringe a uma empresa (ex.: --company localiza)`);
  process.exit(argv[0] === "run" ? 0 : 1);
}

const { values } = parseArgs({
  args: argv.slice(1),
  options: {
    commit: { type: "boolean", default: false },
    company: { type: "string" },
  },
});

const result = await runCompanyWatch({ companyHandle: values.company, commit: values.commit });
report(result);
if (result.commit) appendInbox(result);

// ─────────────────────────────────────────────────────────────────────────────

function report(r: WatchRunResult): void {
  console.log(r.commit ? "APLICADO — gravou no banco.\n" : "DRY-RUN — nada foi escrito.\n");

  let totalFound = 0;
  let totalPassed = 0;
  const dist = { remote: 0, hybrid: 0, onsite: 0, none: 0 };

  for (const o of r.outcomes) {
    if (o.error) {
      console.log(`✖ ${o.company} (${o.handle}): ${o.error}`);
      continue;
    }
    const passouFiltro = o.found - o.filteredOut;
    totalFound += o.found;
    totalPassed += passouFiltro;
    dist.remote += o.modalityStats.remote;
    dist.hybrid += o.modalityStats.hybrid;
    dist.onsite += o.modalityStats.onsite;
    dist.none += o.modalityStats.none;
    console.log(
      `${o.company} (${o.handle}): ${o.found} vagas · ${passouFiltro} passaram o filtro título+departamento · ${o.inserted} novas`
    );
  }

  // Os três números pedidos: total, quantas passaram o filtro título-only
  // (a Fase A não busca descrição — ver company-gupy.ts), e a distribuição
  // real de workplaceType — é ela que decide se o gargalo do exit 5 encolhe.
  if (totalFound > 0) {
    const pctFiltro = Math.round((totalPassed / totalFound) * 100);
    console.log(`\nTotal de vagas: ${totalFound}`);
    console.log(`Passaram o filtro (título+departamento, sem descrição nesta fase): ${totalPassed} (${pctFiltro}%)`);
    const withMod = dist.remote + dist.hybrid + dist.onsite;
    const pctMod = Math.round((withMod / totalFound) * 100);
    console.log(
      `Modalidade estruturada: ${withMod}/${totalFound} (${pctMod}%) — ` +
        `remote ${dist.remote} · hybrid ${dist.hybrid} · on-site ${dist.onsite} · ausente ${dist.none}`
    );
  }

  if (r.scored.length) {
    console.log(`\n${r.scored.length} vaga(s) pontuada(s):`);
    for (const s of r.scored) {
      console.log(`  [${s.score.toFixed(1).padStart(5)}] ${s.title} @ ${s.company} — ${s.status}`);
    }
  }

  if (!r.commit) {
    console.log("\nPara aplicar de verdade: npx tsx src/cli/watch.ts run --commit");
  }
}

function appendInbox(r: WatchRunResult): void {
  if (!r.scored.length) return; // não polui o inbox com rodada sem vaga nova
  mkdirSync(join(PROJECT_ROOT, "output", "_watch"), { recursive: true });

  const linhas = [`\n## ${nowIso()} — watch run`, ""];
  for (const s of r.scored) {
    const job = getJob(s.jobId);
    const modalidade = job ? modalityLabel(resolveModality(job)) : "?";
    linhas.push(
      `- **${s.company}** — ${s.title} — score ${s.score.toFixed(1)} — trilha ${s.trackHint ?? "?"} — ` +
        `modalidade ${modalidade} — ${job?.url ?? ""}`
    );
  }
  const erros = r.outcomes.filter((o) => o.error);
  if (erros.length) {
    linhas.push("", "### erros");
    for (const e of erros) linhas.push(`- ${e.company} (${e.handle}): ${e.error}`);
  }
  appendFileSync(INBOX_PATH, linhas.join("\n") + "\n", "utf-8");
  console.log(`\nRegistrado em ${INBOX_PATH}`);
}
