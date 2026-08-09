/**
 * score — confirma geração de kit para vaga com score abaixo do corte.
 *
 *   npx tsx src/cli/score.ts confirm <id> --note "por que vale a pena mesmo assim"
 *   npx tsx src/cli/score.ts clear <id>
 *
 * Existe porque "ignorar: score X < Y" (policy.ts) nunca foi um gate de código —
 * era só o rótulo que o operador via na fila. `kit.ts prepare` agora recusa de
 * verdade (exit 6, ver `blocksGenerationByScore` em src/core/policy.ts) quando o
 * score está abaixo de `policy.generate_min_score` e ninguém confirmou. Este
 * comando é como o operador diz "eu sei, quero mesmo assim" — e fica registrado
 * com data e nota, mesmo padrão de `modality.ts set`.
 */
import { parseArgs } from "node:util";
import { getJob, confirmScore } from "../db/repo/jobs.js";
import { loadConfig } from "../core/config.js";
import { blocksGenerationByScore } from "../core/policy.js";

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
  console.log(`score — confirma geração de kit abaixo do corte de score

  confirm <id>            libera a geração; --note "<texto>" registra o porquê
  clear <id>               apaga a confirmação (volta a exigir --note de novo)`);
  process.exit(0);
}

const sub = argv[0];
const id = argv[1];
if (sub !== "confirm" && sub !== "clear") fatal(`sub-comando desconhecido: '${sub}'`);
if (!id) fatal(`uso: score ${sub} <job_id>`);

const job = getJob(id!);
if (!job) fatal(`vaga '${id}' não existe`);

if (sub === "confirm") {
  const { values } = parseArgs({ args: argv.slice(2), options: { note: { type: "string" } }, allowPositionals: true });
  confirmScore(id!, true, values.note ?? null);
  const config = loadConfig();
  const aindaBloqueia = blocksGenerationByScore(config, { ...job!, score_confirmed_at: new Date().toISOString() });
  console.log(`${job!.title} @ ${job!.company_name} — score ${job!.score ?? "?"}`);
  console.log(aindaBloqueia ? `  ainda bloqueado: ${aindaBloqueia}` : `  confirmado — geração liberada.`);
} else {
  confirmScore(id!, false);
  console.log(`${job!.title} @ ${job!.company_name} — confirmação removida.`);
}

function fatal(msg: string): never {
  console.error(`erro: ${msg}`);
  process.exit(1);
}
