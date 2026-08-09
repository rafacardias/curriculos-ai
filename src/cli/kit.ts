/**
 * kit — prepara o contexto e finaliza o kit de aplicação de uma vaga.
 *
 *   npx tsx src/cli/kit.ts prepare <job_id>   # emite bundle JSON p/ o Claude redigir
 *   npx tsx src/cli/kit.ts finalize <job_id>  # gates + coverage + PDFs + registros
 *
 * Códigos de saída do finalize — distintos de propósito, porque cada um prova
 * uma coisa diferente e os testes asseram isso:
 *   1  resume.md ausente
 *   2  truthcheck (citação inexistente ou bullet sem citação)
 *   3  conteúdo ([CONFIRMAR: ...] sobrevivente, entregável ausente ou vazio)
 *   4  ATS (HTML hostil, ou o PDF não devolve o texto que deveria)
 *
 * E dois do prepare:
 *   5  modalidade não verificada numa vaga fora da UF-base — recusa ANTES de
 *      gastar a geração, porque a resposta muda se vale a pena se candidatar
 *   6  score abaixo do corte de geração e sem confirmação do operador — ver
 *      `blocksGenerationByScore` em src/core/policy.ts
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { PROJECT_ROOT, getDb } from "../db/client.js";
import { getJob } from "../db/repo/jobs.js";
import {
  getApplicationByJob,
  createApplication,
  insertResumeVersion,
} from "../db/repo/applications.js";
import { loadMasterProfile, loadCandidateFacts } from "../core/profile.js";
import { loadConfig } from "../core/config.js";
import { extractKeywords } from "../core/keywords.js";
import { truthcheck, stripCitations } from "../core/truthcheck.js";
import { coverageReport, renderCoverageMd } from "../core/coverage.js";
import {
  checkExpectedFiles,
  checkPlaceholders,
  checkAtsHostileHtml,
  checkTextFidelity,
  checkReadingOrder,
  formatGateFailures,
  type GateFailure,
} from "../core/gates.js";
import { extractPdfText } from "../render/pdf-text.js";
import { blocksGeneration } from "../core/modality.js";
import { buildPortablePrompt, parsePortableResponse } from "../core/portable-prompt.js";
import { resolveLocality } from "../core/locality.js";
import { gerarKit, parseVia } from "../local/generate-kit.js";
import { lerSalaryResearch } from "../local/salary.js";
import { decidePolicy, blocksGenerationByScore } from "../core/policy.js";
import { assignVariant } from "../core/experiments.js";
import { normalize } from "../core/dedup.js";
import { wrapAtsHtml } from "../render/template.js";
import { htmlToPdf } from "../render/pdf.js";

// parseArgs, não aritmética sobre indexOf: ver CLASSE-01 instância 6 no
// KNOWN-BUGS.md — `argv[argv.indexOf("--x") + 1]` lê a flag ausente como o
// primeiro argumento posicional, e isso já estornou 60 rejeições por engano.
const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    via: { type: "string" },
    out: { type: "string" },
    revise: { type: "boolean", default: false },
  },
});
const [cmd, jobId, arg3] = positionals;
if (!cmd || !jobId || !["prepare", "finalize", "prompt", "ingest", "generate"].includes(cmd)) {
  console.error(`uso: kit <comando> <job_id>

  prepare  <job_id>            monta o bundle JSON para a LLM redigir
  finalize <job_id>            gates + coverage + PDFs + registros
  prompt   <job_id>            escreve PROMPT.md autocontido para colar em QUALQUER LLM
  ingest   <job_id> <arquivo>  quebra a resposta da LLM nos 4 arquivos do kit
  generate <job_id>            redige o kit pela via escolhida

    --via cli|agentic|external   OBRIGATÓRIA. agentic = o laço com /gerar (validado)
                                 cli = disparo único, 6x mais barato, reprovou a
                                 não-regressão em 1 de 3 vagas — ver docs/custo-geracao.md
    --revise                     segunda passada se a cobertura ficar abaixo do limiar (máx. 1)
    --out <dir>                  escreve noutro diretório e NÃO registra nada (medição)`);
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

const profile = loadMasterProfile();
const config = loadConfig();

if (cmd === "prepare") {
  // Gate de modalidade — exit 5. Antes de qualquer token gasto: um kit custa
  // ~$3 e ~4 min, resolver a modalidade custa ~1 min, e escrever uma carta
  // aceitando o cargo sem saber se é presencial em São Paulo é o erro concreto
  // que o operador nomeou. Ver `blocksGeneration` em src/core/modality.ts.
  const bloqueio = blocksGeneration(job, resolveLocality(job.location));
  if (bloqueio) {
    console.error(`GERAÇÃO RECUSADA: ${bloqueio}

Resolva antes de gastar uma geração:
  npx tsx src/cli/modality.ts set ${jobId} remote|hybrid|onsite --note "onde você leu"

Para ver as pistas do próprio anúncio:
  npx tsx src/cli/modality.ts --pending`);
    process.exit(5);
  }

  // Gate de score — exit 6. Ver `blocksGenerationByScore` em src/core/policy.ts.
  const bloqueioScore = blocksGenerationByScore(config, job);
  if (bloqueioScore) {
    console.error(`GERAÇÃO RECUSADA: ${bloqueioScore}

Se quiser gerar mesmo assim:
  npx tsx src/cli/score.ts confirm ${jobId} --note "por que vale a pena mesmo com o score baixo"`);
    process.exit(6);
  }

  mkdirSync(kitDir, { recursive: true });
  const jdText = `${job.title}\n${job.description ?? ""}`;
  const jdKeywords = extractKeywords(jdText, 40);

  const db = getDb();
  const tracks = db.prepare("SELECT id, name, summary, keywords FROM profile_tracks WHERE enabled = 1").all() as unknown as Array<{
    id: string; name: string; summary: string | null; keywords: string;
  }>;

  // Fatos do answer bank já conhecidos (para o answers.md reutilizar)
  const knownAnswers = db
    .prepare("SELECT question_text, answer, language FROM answer_bank ORDER BY times_used DESC LIMIT 20")
    .all();

  const variant = config.experiments.enabled ? assignVariant(job.track_hint, job.source) : null;

  // ORDEM DAS CHAVES É DELIBERADA: primeiro o que é IDÊNTICO em toda vaga
  // (profile, tracks, candidate_facts ≈ 6k tokens), depois o que muda por vaga.
  // Prefixo estável primeiro é o que permite reuso de cache entre kits de um
  // lote. Antes disso a ordem era `job` primeiro, o que destruía o reuso.
  const bundle = {
    profile,
    tracks: tracks.map((t) => ({ ...t, keywords: JSON.parse(t.keywords) })),
    // VALOR, não só a chave. Passar `{key, language}` sem `value` fazia o
    // redator ver o nome do dado e não o dado — e ir buscar no disco. Foram 7
    // dos 38 turnos da geração da Techne (medido, 2026-08-07: 4 Greps por
    // `candidate_facts`, mais profile.ts, mais CANDIDATE_FACTS_PATH, mais o
    // YAML). É CLASSE-01 na camada de contexto: chave sem valor lida como
    // informação disponível — mesma família do `remote_type = NULL`.
    candidate_facts: loadCandidateFacts(),
    // Resultado da busca de faixa salarial, se `src/cli/salary.ts` já rodou.
    // Sem ela o redator marca [CONFIRMAR: pretensão] e o finalize sai 3 — a
    // degradação correta. Ver src/local/salary.ts.
    salary_research: lerSalaryResearch(kitDir),
    known_screening_answers: knownAnswers,
    expected_files: ["resume.md", "cover-letter.md", "answers.md", "outreach.md"],
    kit_dir: kitDir,
    variant,
    job: {
      id: job.id,
      title: job.title,
      company: job.company_name,
      url: job.url,
      location: job.location,
      remote_type: job.remote_type,
      language: job.language,
      seniority: job.seniority,
      ats_platform: job.ats_platform,
      track_hint: job.track_hint,
      description: job.description,
    },
    jd_keywords: jdKeywords,
  };
  writeFileSync(join(kitDir, "bundle.json"), JSON.stringify(bundle), "utf-8");
  // NÃO despeja o bundle em stdout. Ele já está no arquivo, e despejar fazia o
  // redator gastar um turno relendo o que o prepare acabou de gerar — 40 KB que
  // entravam no prefixo e eram relidos em todos os turnos seguintes.
  console.log(`bundle: ${join(kitDir, "bundle.json").replace(PROJECT_ROOT + "/", "")}`);
  console.log(
    `  ${jdKeywords.length} keywords do JD · ${tracks.length} trilhas · ` +
      `${bundle.candidate_facts.length} candidate_facts · ${knownAnswers.length} respostas conhecidas`
  );
  console.log(`kit_dir: ${kitDir.replace(PROJECT_ROOT + "/", "")}`);
} else if (cmd === "prompt") {
  // Caminho portátil: o mesmo bundle, embrulhado num prompt autocontido para
  // rodar em qualquer LLM. O `finalize` valida igual — ver src/core/portable-prompt.ts.
  if (!existsSync(join(kitDir, "bundle.json"))) {
    console.error(`bundle.json não existe em ${kitDir} — rode 'kit prepare ${jobId}' antes.`);
    process.exit(1);
  }
  const texto = buildPortablePrompt(kitDir);
  const destino = join(kitDir, "PROMPT.md");
  writeFileSync(destino, texto, "utf-8");
  console.log(`prompt escrito: ${destino.replace(PROJECT_ROOT + "/", "")}`);
  // 2,6 chars/token, não 4. Medido em 2026-08-07 no PROMPT.md da Techne:
  // 44.426 chars = 17.117 tokens de entrada reais. O `chars/4` que estava aqui
  // subestimava em 54% — JSON tokeniza denso por causa da pontuação.
  console.log(`  ${texto.length.toLocaleString("pt-BR")} caracteres  ≈ ${Math.round(texto.length / 2.6).toLocaleString("pt-BR")} tokens`);
  console.log(`
1. copie:   pbcopy < "${destino}"
2. cole numa LLM à sua escolha e mande rodar
3. salve a resposta inteira num arquivo, ex.: ${kitDir.replace(PROJECT_ROOT + "/", "")}/resposta.txt
4. npx tsx src/cli/kit.ts ingest ${jobId} <arquivo>
5. npx tsx src/cli/kit.ts finalize ${jobId}

O finalize roda os MESMOS gates — citação inexistente reprova igual (exit 2).`);
} else if (cmd === "generate") {
  if (!existsSync(join(kitDir, "bundle.json"))) {
    console.error(`bundle.json não existe em ${kitDir} — rode 'kit prepare ${jobId}' antes.`);
    process.exit(1);
  }
  let via;
  try {
    via = parseVia(flags.via);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
  const outDir = flags.out ?? kitDir;
  const jdText = `${job.title}\n${job.description ?? ""}`;
  const r = await gerarKit({
    via,
    config,
    kitDir,
    outDir,
    jobId,
    jdText,
    revisar: flags.revise,
    limiarCobertura: 100, // sempre revisa quando --revise; o limiar fino é decisão de policy
    logPath: join(PROJECT_ROOT, "logs", `pipeline-${jobId}.log`),
  });

  for (const d of r.disparos) {
    console.log(
      `  disparo: ${d.turns} turno(s) · entrada ${d.usage.prefixo.toLocaleString("pt-BR")} tok · ` +
        `saída ${d.usage.output.toLocaleString("pt-BR")} · $${d.costUsd.toFixed(4)} · ${(d.durationMs / 1000).toFixed(0)}s`
    );
  }
  console.log(
    `via ${r.via} · entrada total ${r.prefixoTotal.toLocaleString("pt-BR")} tok · $${r.custoTotal.toFixed(4)}`
  );
  if (r.revisaoNota) console.log(`  ${r.revisaoNota}`);
  if (!r.ok) {
    console.error(`geração falhou: ${r.erro}`);
    process.exit(1);
  }
  if (via === "external") {
    console.log(`PROMPT.md pronto em ${join(kitDir, "PROMPT.md").replace(PROJECT_ROOT + "/", "")}`);
    console.log(`  cole numa LLM, salve a resposta e rode: kit ingest ${jobId} <arquivo>`);
  } else if (via === "cli") {
    console.log(`4 arquivos em ${outDir.replace(PROJECT_ROOT + "/", "")}`);
    if (flags.out) console.log("  --out: nada foi registrado no banco. Pontue com scripts/measure-kit.ts");
    else console.log(`  agora: npx tsx src/cli/kit.ts finalize ${jobId}`);
  }
} else if (cmd === "ingest") {
  if (!arg3) {
    console.error(`uso: kit ingest ${jobId} <arquivo com a resposta da LLM>`);
    process.exit(1);
  }
  if (!existsSync(arg3)) {
    console.error(`arquivo não encontrado: ${arg3}`);
    process.exit(1);
  }
  const esperados = ["resume.md", "cover-letter.md", "answers.md", "outreach.md"];
  const { files, missing } = parsePortableResponse(readFileSync(arg3, "utf-8"), esperados);
  if (missing.length) {
    // Recusa em vez de gravar parcialmente: 3 de 4 arquivos deixaria o erro
    // aparecer lá no finalize, longe da causa.
    console.error(`resposta incompleta — faltam: ${missing.join(", ")}`);
    console.error(`achei: ${Object.keys(files).join(", ") || "nenhum bloco"}`);
    console.error(`\nO delimitador tem que estar sozinho na linha, exatamente assim:`);
    console.error(`  ===== FILE: resume.md =====`);
    process.exit(1);
  }
  mkdirSync(kitDir, { recursive: true });
  for (const [nome, corpo] of Object.entries(files)) {
    if (!esperados.includes(nome)) continue; // ignora bloco extra que o modelo inventar
    writeFileSync(join(kitDir, nome), corpo, "utf-8");
    console.log(`  escrito: ${nome}  (${corpo.length.toLocaleString("pt-BR")} chars)`);
  }
  console.log(`\nagora: npx tsx src/cli/kit.ts finalize ${jobId}`);
} else {
  // finalize
  const resumePath = join(kitDir, "resume.md");
  if (!existsSync(resumePath)) {
    console.error(`resume.md não encontrado em ${kitDir} — rode prepare e gere os arquivos antes.`);
    process.exit(1);
  }
  const resumeMd = readFileSync(resumePath, "utf-8");

  // 1. Truthcheck — citação inexistente = falha
  const tc = truthcheck(resumeMd, profile);
  if (!tc.ok) {
    console.error("TRUTHCHECK FALHOU:");
    for (const id of tc.invalid) console.error(`  - citação inexistente: [exp:${id}]`);
    for (const b of tc.uncitedBullets) console.error(`  - bullet sem citação: "${b}"`);
    process.exit(2);
  }

  // 2. Gates de CONTEÚDO (exit 3) — valem para os QUATRO entregáveis, não só o
  //    currículo. Até aqui o finalize nunca lia answers.md nem outreach.md,
  //    apesar de os dois estarem em expected_files.
  const EXPECTED = ["resume.md", "cover-letter.md", "answers.md", "outreach.md"];
  const entregaveis: Record<string, string | null> = {};
  for (const nome of EXPECTED) {
    const p = join(kitDir, nome);
    entregaveis[nome] = existsSync(p) ? readFileSync(p, "utf-8") : null;
  }
  const presentes = Object.fromEntries(
    Object.entries(entregaveis).filter(([, v]) => v != null)
  ) as Record<string, string>;

  const falhasConteudo = [
    checkExpectedFiles(EXPECTED, entregaveis),
    checkPlaceholders(presentes),
  ].filter((f): f is GateFailure => f != null);

  if (falhasConteudo.length) {
    console.error("GATES DE CONTEÚDO FALHARAM:");
    console.error(formatGateFailures(falhasConteudo));
    console.error("\n[CONFIRMAR: ...] é correto DURANTE a geração — é assim que o sistema evita");
    console.error("inventar dado. O defeito é ele sobreviver até o envio. Preencha e rode de novo.");
    process.exit(3);
  }

  // 3. Coverage — calculado aqui, mas GRAVADO depois do render: o relatório passou
  //    a trazer páginas e caracteres extraíveis do PDF, que só existem lá na frente.
  const cleanMd = stripCitations(resumeMd);
  const jdText = `${job.title}\n${job.description ?? ""}`;
  const report = coverageReport(jdText, cleanMd);

  // 4. Render PDFs
  const resumeHtml = wrapAtsHtml(cleanMd, `${profile.identity.name} — ${job.title}`);
  const resumePdf = join(kitDir, "resume.pdf");
  const { innerText } = await htmlToPdf(resumeHtml, resumePdf);
  const coverPath = join(kitDir, "cover-letter.md");
  if (existsSync(coverPath)) {
    await htmlToPdf(
      wrapAtsHtml(readFileSync(coverPath, "utf-8"), `Cover Letter — ${profile.identity.name}`),
      join(kitDir, "cover-letter.pdf")
    );
  }

  // 5. Gates de ATS (exit 4) — o que a máquina do outro lado vai conseguir ler.
  //    Três verificações que não se substituem: o HTML não pode ter construção
  //    hostil; o texto extraído do PDF prova o que o ATS de fato lê; e o
  //    innerText comparado ao PDF prova que a ORDEM DE LEITURA sobreviveu — é a
  //    parte que o parser sozinho não pega.
  const pdfText = await extractPdfText(resumePdf);
  const falhasAts = [
    checkAtsHostileHtml(resumeHtml),
    checkTextFidelity(cleanMd, pdfText.text, "pdf"),
    checkReadingOrder(innerText, pdfText.text),
  ].filter((f): f is GateFailure => f != null);

  if (falhasAts.length) {
    console.error("GATES DE ATS FALHARAM:");
    console.error(formatGateFailures(falhasAts));
    console.error(`\nPDF: ${pdfText.pages} página(s), ${pdfText.text.length} chars extraídos.`);
    rmSync(resumePdf, { force: true });
    console.error("O resume.pdf foi removido — um PDF que o ATS não lê não deve ficar no kit.");
    process.exit(4);
  }

  writeFileSync(
    join(kitDir, "coverage-report.md"),
    renderCoverageMd(report, { pages: pdfText.pages, extractedChars: pdfText.text.length }),
    "utf-8"
  );

  // 6. Registros
  const policy = decidePolicy(config, job, job.score ?? 0, job.track_hint);
  let app = getApplicationByJob(jobId);
  if (!app) app = createApplication(jobId, job.track_hint, kitDir, policy.submissionMode);
  const bundlePath = join(kitDir, "bundle.json");
  const variant = existsSync(bundlePath)
    ? (JSON.parse(readFileSync(bundlePath, "utf-8")).variant ?? null)
    : null;
  insertResumeVersion(app.id, { md: resumePath, pdf: resumePdf }, report, tc, variant);

  console.log(`kit finalizado: ${kitDir}`);
  console.log(`application: ${app.id} (kit_ready · modo ${policy.submissionMode ?? "manual"})`);
  console.log(`truthcheck OK: ${tc.citations.length} fatos citados`);
  console.log(
    `coverage: ${report.coveragePct}% (${report.covered.length}/${report.jdKeywords.length} keywords) · ` +
      `ATS heurístico: ${report.atsScoreHeuristic}/100 (estimativa)`
  );
  if (report.missing.length) {
    console.log(`keywords não cobertas: ${report.missing.slice(0, 12).join(", ")}${report.missing.length > 12 ? "…" : ""}`);
  }
}
