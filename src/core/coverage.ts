import { extractKeywords, termsPresent } from "./keywords.js";

export interface CoverageReport {
  jdKeywords: string[];
  covered: string[];
  missing: string[];
  coveragePct: number;
  atsScoreHeuristic: number; // estimativa — ATSs reais não publicam critérios
}

/**
 * Compara as keywords do JD com o texto final do currículo.
 * O número único (atsScoreHeuristic) é um proxy; o artefato honesto é a
 * lista covered/missing.
 */
export function coverageReport(jdText: string, resumeText: string, top = 30): CoverageReport {
  const jdKeywords = extractKeywords(jdText, top).map((k) => k.term);
  const covered = termsPresent(resumeText, jdKeywords);
  const missing = jdKeywords.filter((k) => !covered.includes(k));
  const coveragePct = jdKeywords.length ? Math.round((covered.length / jdKeywords.length) * 100) : 0;

  // Heurística: cobertura pesa 80; formato assumido conforme (template ATS) vale 20.
  const atsScoreHeuristic = Math.round(coveragePct * 0.8 + 20);

  return { jdKeywords, covered, missing, coveragePct, atsScoreHeuristic };
}

/**
 * Fatos do PDF gerado, medidos depois do render.
 *
 * Aparecem aqui e NÃO como gate de propósito: um currículo de 2 páginas é ruim
 * para vaga de entrada e normal para sênior, e o sistema não sabe distinguir os
 * dois casos. Reprovar seria arbitrário; informar ao lado da cobertura deixa a
 * decisão com quem tem o contexto.
 */
export interface PdfFacts {
  pages: number;
  extractedChars: number;
}

export function renderCoverageMd(report: CoverageReport, pdf?: PdfFacts): string {
  return [
    "# Coverage Report",
    "",
    `**Cobertura de keywords do JD:** ${report.coveragePct}% (${report.covered.length}/${report.jdKeywords.length})`,
    `**ATS score (estimativa heurística — ATSs reais não publicam seus critérios):** ${report.atsScoreHeuristic}/100`,
    ...(pdf
      ? [
          `**PDF:** ${pdf.pages} página(s) · ${pdf.extractedChars} caracteres extraíveis por um parser`,
          pdf.pages > 1
            ? "> 2+ páginas costuma jogar contra em vaga de entrada e é esperado em sênior — " +
              "por isso é informação, não gate."
            : "",
        ].filter(Boolean)
      : []),
    "",
    "## Keywords cobertas",
    ...report.covered.map((k) => `- ${k}`),
    "",
    "## Keywords NÃO cobertas",
    "(Uma keyword só deve ser coberta se houver fato real que a sustente — nunca inventar.)",
    ...report.missing.map((k) => `- ${k}`),
    "",
  ].join("\n");
}
