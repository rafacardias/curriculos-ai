/**
 * search — roda as buscas configuradas (ou uma query ad-hoc) em todas as fontes.
 *
 *   npx tsx src/cli/search.ts                          # buscas do config.yaml
 *   npx tsx src/cli/search.ts --query "growth manager" # query ad-hoc
 *   npx tsx src/cli/search.ts --url <url> [--title t --company c]  # vaga manual
 *   npx tsx src/cli/search.ts --auto                   # modo launchd (respeita auto_search)
 */
import { parseArgs } from "node:util";
import { loadConfig } from "../core/config.js";
import { runSearch } from "../core/pipeline.js";
import { resolveAdapters } from "../adapters/index.js";
import { fetchManualUrl } from "../adapters/manual-url.js";
import { insertJob } from "../db/repo/jobs.js";
import { scoreNewJobs, decayPreferenceWeights } from "../core/scoring.js";

const { values } = parseArgs({
  options: {
    query: { type: "string" },
    url: { type: "string" },
    title: { type: "string" },
    company: { type: "string" },
    auto: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log("uso: search [--query q] [--url u [--title t --company c]] [--auto]");
  process.exit(0);
}

const config = loadConfig();

if (values.auto && !config.auto_search) {
  console.log("auto_search está off no config.yaml — saindo.");
  process.exit(0);
}

if (values.url) {
  const result = await fetchManualUrl(values.url, {
    title: values.title,
    companyName: values.company,
  });
  if (result.errors.length) {
    console.error(`erro ao buscar URL: ${result.errors.join("; ")}`);
    process.exit(1);
  }
  const raw = result.jobs[0]!;
  const inserted = insertJob(raw);
  if (!inserted) {
    console.log("vaga já existia (fingerprint duplicado).");
    process.exit(0);
  }
  const scored = scoreNewJobs(config, [inserted.id]);
  const s = scored[0];
  console.log(`vaga inserida: ${inserted.id}`);
  console.log(`  ${inserted.title} @ ${inserted.company_name}`);
  if (s) console.log(`  score ${s.score} · trilha ${s.trackHint ?? "?"} · ${s.policyAction} · status ${s.status}`);
  process.exit(0);
}

const specs = values.query
  ? [{ query: values.query, sources: ["remotive", "remoteok", "wwr", "gupy", "linkedin"], location: undefined, remote_only: false }]
  : config.searches.filter((s) => s.query.trim().length > 0);

if (!specs.length) {
  console.error("nenhuma busca configurada — preencha config.yaml (searches[].query) ou use --query.");
  process.exit(1);
}

decayPreferenceWeights(config);

let totalNew = 0;
for (const spec of specs) {
  const adapters = resolveAdapters(spec.sources);
  const result = await runSearch(
    adapters,
    { query: spec.query, location: spec.location, remoteOnly: spec.remote_only },
    values.auto ? "auto" : "manual"
  );
  console.log(`\nbusca: "${spec.query}" (run ${result.runId})`);
  for (const [source, stats] of Object.entries(result.perSource)) {
    const err = stats.errors.length ? `  ⚠ ${stats.errors.join("; ")}` : "";
    console.log(`  ${source}: ${stats.found} encontradas, ${stats.new} novas${err}`);
  }
  const scored = scoreNewJobs(config, result.newJobIds);
  const queued = scored.filter((s) => s.status === "queued");
  totalNew += result.newJobIds.length;
  console.log(`  pontuadas: ${scored.length} · na fila: ${queued.length}`);
  for (const s of queued.slice(0, 10)) {
    console.log(`    [${s.score}] ${s.title} @ ${s.company} · ${s.policyAction} (${s.jobId})`);
  }
}
console.log(`\ntotal de vagas novas: ${totalNew}`);

if (values.auto) {
  // fim do ciclo automático: painel atualizado + notificação macOS
  const { buildDashboard } = await import("../dashboard/build.js");
  buildDashboard();
  try {
    const { execFileSync } = await import("node:child_process");
    execFileSync("osascript", [
      "-e",
      `display notification "${totalNew} vagas novas — abra o Claude Code e rode /status" with title "Curriculos"`,
    ]);
  } catch {
    /* notificação é best-effort */
  }
}
