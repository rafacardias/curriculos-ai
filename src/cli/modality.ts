/**
 * modality — o estado de modalidade da fila, explícito, e onde resolvê-lo.
 *
 *   npx tsx src/cli/modality.ts                      # a fila com modalidade
 *   npx tsx src/cli/modality.ts --pending            # só as pendentes, com pistas
 *   npx tsx src/cli/modality.ts set <id> remote --note "JD: 100% remoto"
 *   npx tsx src/cli/modality.ts clear <id>
 *
 * Existe porque `remote_type` NULL — 138 vagas do acervo, o normal para LinkedIn e
 * para o fallback `/vaga` — não é "tudo bem", é "ninguém verificou". Sem um lugar
 * que mostre isso, a pendência vira aprovação silenciosa e o operador se candidata
 * a um presencial em São Paulo achando que era remoto.
 *
 * O comando NÃO infere modalidade do texto. As pistas são trechos para ele ler;
 * quem decide é ele, e a decisão fica gravada com data e origem.
 */
import { parseArgs } from "node:util";
import { loadConfig } from "../core/config.js";
import { confirmModality, listOpenQueueJobs, getJob, type JobRow } from "../db/repo/jobs.js";
import {
  resolveModality,
  remoteHints,
  modalityLabel,
  parseModalityState,
  type AssertedModality,
} from "../core/modality.js";
import { hardFilterReason } from "../core/scoring.js";
import { resolveLocality, loadLocalityLexicon } from "../core/locality.js";

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`modality — estado de modalidade (remoto/híbrido/presencial/pendente) da fila

  (sem argumento)          lista a fila aberta com a modalidade de cada vaga
  --pending                só as pendentes, com as pistas do texto do anúncio
  --limit <n>              corta a listagem
  set <id> <estado>        remote | hybrid | onsite  — registra o que VOCÊ leu
       --note "<texto>"    onde leu (fica gravado junto)
  clear <id>               apaga a confirmação (volta a pendente)

'pendente' = nem o adapter nem você afirmaram nada. Não é "remoto", não é
"presencial": é não verificado. O filtro de presencial-fora-da-UF só age sobre
estado afirmado — e passa a agir sobre o que você confirmar, na repontuação
seguinte (npx tsx src/cli/rescore.ts --commit).`);
  process.exit(0);
}

const sub = argv[0];

if (sub === "set" || sub === "clear") {
  comandoEscrita(sub);
} else {
  listar();
}

// ─────────────────────────────────────────────────────────────────────────────

function comandoEscrita(sub: "set" | "clear"): void {
  const id = argv[1];
  if (!id) fatal(`uso: modality ${sub} <job_id>${sub === "set" ? " <remote|hybrid|onsite>" : ""}`);

  const job = getJob(id!);
  if (!job) fatal(`vaga '${id}' não existe`);

  let estado: AssertedModality | null = null;
  let note: string | null = null;
  if (sub === "set") {
    estado = parseModalityState(argv[2]);
    if (!estado) fatal(`estado inválido: '${argv[2] ?? ""}' — use remote, hybrid ou onsite`);
    const { values } = parseArgs({ args: argv.slice(3), options: { note: { type: "string" } }, allowPositionals: true });
    note = values.note ?? null;
  }

  const antes = resolveModality(job!);
  confirmModality(id!, estado, note);

  const depois = resolveModality({ ...job!, modality_confirmed: estado, modality_note: note });
  console.log(`${job!.title} @ ${job!.company_name}`);
  console.log(`  ${modalityLabel(antes)} → ${modalityLabel(depois)}`);
  if (antes.adapterSaid && estado && antes.adapterSaid !== estado) {
    console.log(`  ⚠ diverge do adapter (${job!.source} dizia "${antes.adapterSaid}") — o campo da fonte foi preservado`);
  }

  // O efeito no filtro é consequência da confirmação, e o operador tem que vê-lo
  // ANTES de rodar o rescore: uma confirmação que despromove a vaga não pode
  // chegar como surpresa na próxima leitura da fila.
  const config = loadConfig();
  const simulado: JobRow = { ...job!, modality_confirmed: estado };
  const motivo = hardFilterReason(config, simulado);
  if (motivo) {
    console.log(`\n  Com essa confirmação a vaga passa a ser filtrada: ${motivo}`);
  } else if (hardFilterReason(config, job!)) {
    console.log(`\n  Com essa confirmação a vaga DEIXA de ser filtrada.`);
  }
  console.log(`\n  A fila só reflete isso após: npx tsx src/cli/rescore.ts --commit`);
}

function listar(): void {
  const { values } = parseArgs({
    args: argv,
    options: { pending: { type: "boolean", default: false }, limit: { type: "string" } },
    allowPositionals: true,
  });

  const config = loadConfig();
  const todas = listOpenQueueJobs();
  const linhas = todas.map((j) => {
    const m = resolveModality(j);
    const loc = resolveLocality(j.location);
    return {
      job: j,
      m,
      // Só interessa a pendência que pode MUDAR alguma coisa: fora da UF-base é
      // onde "não sei" e "presencial" levam a resultados diferentes. Remoto
      // confirmado em Belo Horizonte não é pendência de ninguém.
      arriscada: m.state === "unknown" && loc.level !== "unknown" && !loc.isHomeUf,
      loc,
    };
  });

  const pendentes = linhas.filter((l) => l.m.state === "unknown");
  const alvo = values.pending ? pendentes : linhas;
  const corte = values.limit ? parseInt(values.limit, 10) : alvo.length;

  const porEstado = new Map<string, number>();
  for (const l of linhas) porEstado.set(l.m.state, (porEstado.get(l.m.state) ?? 0) + 1);

  console.log(
    `Fila aberta: ${linhas.length} vagas  ·  ` +
      ["remote", "hybrid", "onsite", "unknown"]
        .map((s) => `${s}=${porEstado.get(s) ?? 0}`)
        .join(" · ")
  );
  const arriscadas = linhas.filter((l) => l.arriscada).length;
  if (arriscadas) {
    const filtro = config.filters.exclude_onsite_outside_home_uf
      ? "e o filtro de presencial-fora-da-UF está ligado, então confirmar muda a fila"
      : "mas o filtro de presencial-fora-da-UF está DESLIGADO no config — confirmar não muda a fila";
    console.log(
      `Pendentes fora de ${loadLocalityLexicon().base.uf}: ${arriscadas}` +
        ` — é aqui que "não sei" muda o resultado, ${filtro}.\n`
    );
  } else {
    console.log("");
  }

  for (const { job, m, loc, arriscada } of alvo.slice(0, corte)) {
    const marca = m.state === "unknown" ? (arriscada ? "⚠" : "·") : " ";
    console.log(`${marca} [${(job.score ?? 0).toFixed(1).padStart(5)}] ${job.title} @ ${job.company_name}`);
    console.log(
      `      ${modalityLabel(m)}  ·  ${job.location ?? "sem localidade"}` +
        `${loc.uf ? ` (${loc.uf})` : ""}  ·  ${job.source}  ·  id ${job.id}`
    );
    if (m.note) console.log(`      nota: ${m.note}`);

    if (m.state === "unknown") {
      const pistas = remoteHints(`${job.title}\n${job.description ?? ""}`);
      if (!pistas.length) {
        console.log(
          job.description
            ? `      pistas: nenhuma — o anúncio não fala de modalidade. Só abrindo a vaga.`
            : `      pistas: nenhuma — esta vaga nem tem descrição salva (o adapter não baixou o JD).`
        );
      } else {
        for (const p of pistas) console.log(`      pista[${p.kind}] "${p.term}" — ${p.snippet}`);
      }
      console.log(`      ↳ npx tsx src/cli/modality.ts set ${job.id} <remote|hybrid|onsite>`);
    }
    console.log(`      ${job.url}`);
    console.log("");
  }

  if (!values.pending && pendentes.length) {
    console.log(`${pendentes.length} pendente(s). Para ver só elas: npx tsx src/cli/modality.ts --pending`);
  }
}

function fatal(msg: string): never {
  console.error(`erro: ${msg}`);
  process.exit(1);
}
