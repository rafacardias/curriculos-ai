import { chromium, type Browser, type Page } from "playwright-core";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import { getDb, nowIso } from "../db/client.js";
import { findChrome } from "../render/pdf.js";
import { findSubmissionAdapter } from "./adapters.js";
import { fillApplicationForm } from "./form-filler.js";
import { setApplicationStatus } from "../db/repo/applications.js";
import { bumpCompanyStat } from "../db/repo/companies.js";
import type { SubmissionKit } from "./types.js";
import type { SubmissionMode } from "../core/types.js";

export interface RunResult {
  submissionId: string;
  status: "filled" | "awaiting_user" | "submitted" | "failed";
  unknown: string[];
  receiptPath?: string;
}

/**
 * Executa uma submissão. Browser SEMPRE headed (visível) — o usuário precisa
 * poder ver/assumir a qualquer momento.
 *
 * review_first: preenche e PARA antes do submit; o browser fica aberto para o
 * usuário revisar e clicar. approve_batch/full_auto: clica submit, exceto se
 * houver pergunta obrigatória desconhecida (pausa em awaiting_user).
 */
export async function runSubmission(
  kit: SubmissionKit,
  jobUrl: string,
  mode: SubmissionMode,
  companyId: string | null
): Promise<RunResult> {
  const db = getDb();
  const adapter = findSubmissionAdapter(jobUrl);
  if (!adapter) {
    throw new Error(`nenhum SubmissionAdapter para esta URL (plataformas: greenhouse, lever): ${jobUrl}`);
  }

  const submissionId = ulid();
  db.prepare(
    `INSERT INTO submissions (id, application_id, adapter, mode, status, started_at, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  ).run(submissionId, kit.applicationId, adapter.id, mode, nowIso(), nowIso());

  const receiptDir = join(kit.kitDir, "receipt");
  mkdirSync(receiptDir, { recursive: true });

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ executablePath: findChrome(), headless: false });
    const page = await browser.newPage();
    await adapter.navigateToForm(page, jobUrl);

    const outcome = await fillApplicationForm(page, kit);
    const filledShot = join(receiptDir, `filled-${Date.now()}.png`);
    await page.screenshot({ path: filledShot, fullPage: true });

    const finish = (status: RunResult["status"], receiptPath?: string, pendingQuestion?: string) => {
      db.prepare(
        `UPDATE submissions SET status = ?, receipt_path = ?, pending_question = ?, finished_at = ? WHERE id = ?`
      ).run(status, receiptPath ?? filledShot, pendingQuestion ?? null, nowIso(), submissionId);
      return { submissionId, status, unknown: outcome.unknown, receiptPath: receiptPath ?? filledShot };
    };

    if (outcome.unknown.length && mode !== "review_first") {
      // pergunta desconhecida: pausa — nunca chuta resposta
      await browser.close();
      return finish("awaiting_user", undefined, outcome.unknown.join(" | "));
    }

    if (mode === "review_first") {
      console.log("\nformulário preenchido — REVISE no browser e clique enviar você mesmo.");
      console.log(`campos preenchidos: ${outcome.filled.length}`);
      if (outcome.unknown.length) {
        console.log(`campos que ficaram em branco (responda no browser): ${outcome.unknown.join(" | ")}`);
      }
      console.log("(o processo aguarda você fechar a janela do browser)");
      const result = finish("filled");
      await page.waitForEvent("close", { timeout: 30 * 60_000 }).catch(() => {});
      await browser.close().catch(() => {});
      return result;
    }

    // approve_batch / full_auto: submete
    await page.locator(adapter.submitButtonSelector).first().click();
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    const confirmShot = join(receiptDir, `submitted-${Date.now()}.png`);
    await page.screenshot({ path: confirmShot, fullPage: true });
    await browser.close();

    setApplicationStatus(kit.applicationId, "applied", { appliedAt: nowIso() });
    if (companyId) bumpCompanyStat(companyId, "applications_count");
    return finish("submitted", confirmShot);
  } catch (err) {
    await browser?.close().catch(() => {});
    db.prepare(`UPDATE submissions SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`).run(
      String(err),
      nowIso(),
      submissionId
    );
    throw err;
  }
}

/** Monta o SubmissionKit a partir do kit_dir de uma aplicação. */
export function loadKitForSubmission(
  jobId: string,
  applicationId: string,
  kitDir: string,
  profile: SubmissionKit["profile"],
  language: "pt" | "en"
): SubmissionKit {
  const resumePdfPath = join(kitDir, "resume.pdf");
  if (!existsSync(resumePdfPath)) {
    throw new Error(`resume.pdf não encontrado em ${kitDir} — rode /gerar antes.`);
  }
  const coverPath = join(kitDir, "cover-letter.md");
  return {
    jobId,
    applicationId,
    kitDir,
    resumePdfPath,
    coverLetterText: existsSync(coverPath) ? readFileSync(coverPath, "utf-8") : null,
    profile,
    language,
  };
}
