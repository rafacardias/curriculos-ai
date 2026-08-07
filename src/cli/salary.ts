/**
 * salary — a busca de faixa salarial de uma vaga, como passo próprio.
 *
 *   npx tsx src/cli/salary.ts <job_id>
 *
 * Roda UMA busca no perfil `salario` (só WebSearch, teto $0,15), grava
 * `salary-research.json` no kit_dir e deixa o `prepare` seguinte incluí-la no
 * bundle. Sem isto o kit sai com `[CONFIRMAR: pretensão]` e o finalize sai 3 —
 * degradação correta, nunca número inventado.
 *
 * Exit codes:
 *   0  faixa pesquisada e gravada (ou já existia e --force não foi passado)
 *   1  vaga não encontrada, kit_dir inexistente, ou a busca não achou dado
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { PROJECT_ROOT } from "../db/client.js";
import { getJob } from "../db/repo/jobs.js";
import { loadConfig } from "../core/config.js";
import { loadCandidateFacts } from "../core/profile.js";
import { normalize } from "../core/dedup.js";
import { pesquisarSalario, lerSalaryResearch } from "../local/salary.js";

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: { force: { type: "boolean", default: false } },
});
const [jobId] = positionals;

if (!jobId) {
  console.error(`uso: salary <job_id> [--force]

Pesquisa a faixa salarial de mercado da vaga e grava no kit_dir.
--force refaz a busca mesmo se já houver resultado gravado.`);
  process.exit(1);
}

const job = getJob(jobId);
if (!job) {
  console.error(`vaga não encontrada: ${jobId}`);
  process.exit(1);
}

const slug = `${normalize(job.company_name).replace(/\s+/g, "-")}-${normalize(job.title).replace(/\s+/g, "-")}`
  .slice(0, 60)
  .replace(/-+$/, "");
const kitDir = join(PROJECT_ROOT, "output", `${slug}-${jobId.slice(-6).toLowerCase()}`);

if (!existsSync(kitDir)) {
  console.error(`kit_dir não existe: ${kitDir} — rode 'kit prepare ${jobId}' antes.`);
  process.exit(1);
}

const jaTem = lerSalaryResearch(kitDir);
if (jaTem && !flags.force) {
  console.log(`já pesquisado em ${jaTem.pesquisadoEm}:`);
  console.log(`  ${jaTem.faixa}`);
  console.log(`  fontes: ${jaTem.fontes}`);
  console.log("use --force para refazer");
  process.exit(0);
}

// A estratégia NÃO é escrita aqui: ela vem do próprio fato do perfil. Se o
// operador mudar a estratégia no candidate-facts.yaml, este comando muda junto.
const fato = loadCandidateFacts().find((f) => f.key === "salary_expectation_brl");
if (!fato) {
  console.error("candidate_fact `salary_expectation_brl` não existe — nada a pesquisar.");
  process.exit(1);
}

const res = await pesquisarSalario(loadConfig(), kitDir, job, fato.value);
if (!res) {
  console.error("a busca não devolveu faixa confiável.");
  console.error("O kit vai sair com [CONFIRMAR: pretensão] e o finalize vai sair 3 — correto.");
  console.error("Preencha à mão no answers.md e rode finalize de novo.");
  process.exit(1);
}

console.log(`faixa: ${res.faixa}`);
console.log(`fontes: ${res.fontes}`);
console.log(`  $${res.custoUsd.toFixed(4)} · ${res.modelo}`);
console.log(`gravado em ${join(kitDir, "salary-research.json").replace(PROJECT_ROOT + "/", "")}`);
console.log(`\nagora: npx tsx src/cli/kit.ts prepare ${jobId}   (para entrar no bundle)`);
