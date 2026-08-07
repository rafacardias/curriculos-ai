/**
 * measure-kit — roda os MESMOS gates do `finalize` contra um diretório arbitrário,
 * sem escrever nada no banco.
 *
 * POR QUE ISSO EXISTE. Para comparar vias de redação (agêntico × disparo único ×
 * LLM externa) na MESMA vaga eu preciso pontuar um kit candidato sem criar uma
 * segunda `application` nem uma `resume_version` — senão a medição contamina o
 * funil que ela deveria estar medindo.
 *
 * O que ele NÃO faz: `createApplication`, `insertResumeVersion`, `decidePolicy`.
 * O que ele faz igualzinho ao `finalize`: truthcheck (2), gates de conteúdo (3),
 * render + gates de ATS (4), coverage. Mesmas funções, mesma ordem, mesma
 * precedência — se divergir do finalize, o número não vale nada.
 *
 *   npx tsx scripts/measure-kit.ts --job <job_id> --dir <caminho> [--json]
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getJob } from "../src/db/repo/jobs.js";
import { loadMasterProfile } from "../src/core/profile.js";
import { truthcheck, stripCitations } from "../src/core/truthcheck.js";
import { coverageReport } from "../src/core/coverage.js";
import {
  checkExpectedFiles,
  checkPlaceholders,
  checkAtsHostileHtml,
  checkTextFidelity,
  checkReadingOrder,
  formatGateFailures,
  type GateFailure,
} from "../src/core/gates.js";
import { extractPdfText } from "../src/render/pdf-text.js";
import { wrapAtsHtml } from "../src/render/template.js";
import { htmlToPdf } from "../src/render/pdf.js";

const { values } = parseArgs({
  options: {
    job: { type: "string" },
    dir: { type: "string" },
    json: { type: "boolean", default: false },
    // Medição quer TODOS os gates, não só o primeiro que reprova. O `finalize`
    // curto-circuita de propósito (o exit code tem de ser o do gate de maior
    // precedência); aqui eu preciso comparar cobertura entre vias mesmo quando
    // o answers.md reprova. `exit` continua sendo o gate de maior precedência.
    all: { type: "boolean", default: false },
  },
});

if (!values.job || !values.dir) {
  console.error("uso: measure-kit --job <job_id> --dir <caminho> [--json]");
  process.exit(1);
}

const job = getJob(values.job);
if (!job) {
  console.error(`vaga não encontrada: ${values.job}`);
  process.exit(1);
}
const dir = values.dir;
const profile = loadMasterProfile();

const EXPECTED = ["resume.md", "cover-letter.md", "answers.md", "outreach.md"];

interface Resultado {
  dir: string;
  exit: number;
  gate: string;
  detalhe?: string[];
  citacoes?: number;
  coveragePct?: number;
  covered?: number;
  jdKeywords?: number;
  atsScoreHeuristic?: number;
  missing?: string[];
  pages?: number;
  extractedChars?: number;
  chars?: Record<string, number>;
}

const out: Resultado = { dir, exit: 0, gate: "ok" };
out.chars = Object.fromEntries(
  EXPECTED.map((n) => [n, existsSync(join(dir, n)) ? readFileSync(join(dir, n), "utf-8").length : 0])
);

/** Registra uma falha sem sobrescrever uma de precedência maior. */
function falha(exit: number, gate: string, detalhe: string[]): void {
  if (out.exit === 0 || exit < out.exit) {
    out.exit = exit;
    out.gate = gate;
  }
  out.detalhe = [...(out.detalhe ?? []), ...detalhe];
}

function encerra(): never {
  if (values.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`\n${dir}`);
    console.log(`  exit ${out.exit} · ${out.gate}`);
    if (out.detalhe?.length) console.log(formatGateFailures([{ gate: out.gate, detail: out.detalhe }]));
    if (out.coveragePct != null) {
      console.log(
        `  coverage: ${out.coveragePct}% (${out.covered}/${out.jdKeywords}) · ` +
          `ATS heurístico ${out.atsScoreHeuristic}/100 (estimativa) · ` +
          `${out.pages} pág · ${out.extractedChars} chars extraídos`
      );
      console.log(`  truthcheck: ${out.citacoes} fatos citados`);
      if (out.missing?.length) console.log(`  não cobertas: ${out.missing.slice(0, 12).join(", ")}`);
    }
  }
  process.exit(0); // o exit code do PROCESSO é 0: o veredicto está em out.exit
}

// 1. resume.md presente (exit 1)
const resumePath = join(dir, "resume.md");
if (!existsSync(resumePath)) {
  out.exit = 1;
  out.gate = "resume_ausente";
  encerra();
}
const resumeMd = readFileSync(resumePath, "utf-8");

// 2. Truthcheck (exit 2)
const tc = truthcheck(resumeMd, profile);
out.citacoes = tc.citations.length;
if (!tc.ok) {
  falha(2, "truthcheck", [
    ...tc.invalid.map((id) => `citação inexistente: [exp:${id}]`),
    ...tc.uncitedBullets.map((b) => `bullet sem citação: "${b}"`),
  ]);
  if (!values.all) encerra();
}

// 3. Gates de conteúdo (exit 3)
const entregaveis: Record<string, string | null> = {};
for (const nome of EXPECTED) {
  const p = join(dir, nome);
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
  falha(3, falhasConteudo.map((f) => f.gate).join("+"), falhasConteudo.flatMap((f) => f.detail));
  if (!values.all) encerra();
}

// 4. Coverage + render + gates de ATS (exit 4)
const cleanMd = stripCitations(resumeMd);
const jdText = `${job.title}\n${job.description ?? ""}`;
const report = coverageReport(jdText, cleanMd);

const resumeHtml = wrapAtsHtml(cleanMd, `${profile.identity.name} — ${job.title}`);
const resumePdf = join(dir, "resume.pdf");
const { innerText } = await htmlToPdf(resumeHtml, resumePdf);
const pdfText = await extractPdfText(resumePdf);

out.coveragePct = report.coveragePct;
out.covered = report.covered.length;
out.jdKeywords = report.jdKeywords.length;
out.atsScoreHeuristic = report.atsScoreHeuristic;
out.missing = report.missing;
out.pages = pdfText.pages;
out.extractedChars = pdfText.text.length;

const falhasAts = [
  checkAtsHostileHtml(resumeHtml),
  checkTextFidelity(cleanMd, pdfText.text, "pdf"),
  checkReadingOrder(innerText, pdfText.text),
].filter((f): f is GateFailure => f != null);

if (falhasAts.length) {
  falha(4, falhasAts.map((f) => f.gate).join("+"), falhasAts.flatMap((f) => f.detail));
}

encerra();
