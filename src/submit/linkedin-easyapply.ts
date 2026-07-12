import { chromium, type BrowserContext, type Page } from "playwright-core";
import { join } from "node:path";
import { userInfo } from "node:os";
import { findChrome } from "../render/pdf.js";
import { fillApplicationForm } from "./form-filler.js";
import type { SubmissionKit, FillOutcome } from "./types.js";

/**
 * LinkedIn Easy Apply — usa sessão LOGADA num perfil de browser dedicado
 * (~/.curriculos-linkedin, separado do Chrome pessoal). RISCO REAL de
 * restrição de conta pelo LinkedIn; full_auto exige i_accept_ban_risk no
 * config e o policy engine bloqueia por default.
 *
 * Fluxo multi-step: preenche o modal, avança (Next/Review) preenchendo cada
 * etapa; em review_first PARA no botão Submit; senão, submete.
 */
const PROFILE_DIR = join(userInfo().homedir, ".curriculos-linkedin");

export async function runEasyApply(
  kit: SubmissionKit,
  jobUrl: string,
  autoSubmit: boolean
): Promise<{ context: BrowserContext; page: Page; outcome: FillOutcome; submitted: boolean }> {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: findChrome(),
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  // logado? página de vaga logada tem o botão Easy Apply / Candidatura simplificada
  const easyApply = page
    .locator('button:has-text("Easy Apply"), button:has-text("Candidatura simplificada")')
    .first();
  await easyApply.waitFor({ timeout: 20000 }).catch(() => {
    throw new Error(
      "botão Easy Apply não encontrado — faça login na janela aberta (sessão fica salva) e rode /submeter de novo, ou a vaga não tem Easy Apply."
    );
  });
  await easyApply.click();

  const outcome: FillOutcome = { filled: [], unknown: [] };
  const modal = page.locator('div[role="dialog"]');
  await modal.waitFor({ timeout: 15000 });

  // avança as etapas do modal preenchendo cada uma (máx. 10 etapas)
  for (let step = 0; step < 10; step++) {
    const stepOutcome = await fillApplicationForm(page, kit);
    outcome.filled.push(...stepOutcome.filled);
    outcome.unknown.push(...stepOutcome.unknown);

    const submitBtn = modal.locator('button[aria-label*="Submit"], button:has-text("Submit application"), button:has-text("Enviar candidatura")').first();
    if ((await submitBtn.count()) > 0 && (await submitBtn.isVisible().catch(() => false))) {
      if (outcome.unknown.length || !autoSubmit) {
        return { context, page, outcome, submitted: false }; // para no submit
      }
      await submitBtn.click();
      await page.waitForTimeout(3000);
      return { context, page, outcome, submitted: true };
    }

    const next = modal
      .locator('button[aria-label*="next"], button:has-text("Next"), button:has-text("Avançar"), button:has-text("Review"), button:has-text("Revisar")')
      .first();
    if ((await next.count()) === 0 || !(await next.isVisible().catch(() => false))) break;
    if (outcome.unknown.length) {
      // etapa com pergunta desconhecida: não avança às cegas
      return { context, page, outcome, submitted: false };
    }
    await next.click();
    await page.waitForTimeout(1500);
  }

  return { context, page, outcome, submitted: false };
}
