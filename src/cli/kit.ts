/**
 * kit — prepara o contexto e finaliza o kit de aplicação de uma vaga.
 *
 *   npx tsx src/cli/kit.ts prepare <job_id>   # emite bundle JSON p/ o Claude redigir
 *   npx tsx src/cli/kit.ts finalize <job_id>  # truthcheck + coverage + PDFs + registros
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
import { decidePolicy } from "../core/policy.js";
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

  const bundle = {
    kit_dir: kitDir,
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

  // 2. Coverage report
  const cleanMd = stripCitations(resumeMd);
  const jdText = `${job.title}\n${job.description ?? ""}`;
  const report = coverageReport(jdText, cleanMd);
  writeFileSync(join(kitDir, "coverage-report.md"), renderCoverageMd(report), "utf-8");

  // 3. Render PDFs
  const resumePdf = join(kitDir, "resume.pdf");
  await htmlToPdf(wrapAtsHtml(cleanMd, `${profile.identity.name} — ${job.title}`), resumePdf);
  const coverPath = join(kitDir, "cover-letter.md");
  if (existsSync(coverPath)) {
    await htmlToPdf(
      wrapAtsHtml(readFileSync(coverPath, "utf-8"), `Cover Letter — ${profile.identity.name}`),
      join(kitDir, "cover-letter.pdf")
    );
  }

  // 4. Registros
  const policy = decidePolicy(config, job, job.score ?? 0, job.track_hint);
  let app = getApplicationByJob(jobId);
  if (!app) app = createApplication(jobId, job.track_hint, kitDir, policy.submissionMode);
  insertResumeVersion(app.id, { md: resumePath, pdf: resumePdf }, report, tc);

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
