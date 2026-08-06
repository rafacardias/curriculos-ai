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
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
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
import { decidePolicy } from "../core/policy.js";
import { assignVariant } from "../core/experiments.js";
import { normalize } from "../core/dedup.js";
import { wrapAtsHtml } from "../render/template.js";
import { htmlToPdf } from "../render/pdf.js";

const [cmd, jobId] = process.argv.slice(2);
if (!cmd || !jobId || !["prepare", "finalize"].includes(cmd)) {
  console.error("uso: kit prepare|finalize <job_id>");
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
  mkdirSync(kitDir, { recursive: true });
  const jdText = `${job.title}\n${job.description ?? ""}`;
  const jdKeywords = extractKeywords(jdText, 40);

  const db = getDb();
  const tracks = db.prepare("SELECT id, name, summary, keywords FROM profile_tracks").all() as unknown as Array<{
    id: string; name: string; summary: string | null; keywords: string;
  }>;

  // Fatos do answer bank já conhecidos (para o answers.md reutilizar)
  const knownAnswers = db
    .prepare("SELECT question_text, answer, language FROM answer_bank ORDER BY times_used DESC LIMIT 20")
    .all();

  const variant = config.experiments.enabled ? assignVariant(job.track_hint, job.source) : null;

  const bundle = {
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
    tracks: tracks.map((t) => ({ ...t, keywords: JSON.parse(t.keywords) })),
    profile,
    candidate_facts: loadCandidateFacts().map((f) => ({ key: f.key, language: f.language })),
    known_screening_answers: knownAnswers,
    expected_files: ["resume.md", "cover-letter.md", "answers.md", "outreach.md"],
  };
  writeFileSync(join(kitDir, "bundle.json"), JSON.stringify(bundle, null, 2), "utf-8");
  console.log(JSON.stringify(bundle, null, 2));
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
