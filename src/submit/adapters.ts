import type { Page } from "playwright-core";
import type { SubmissionAdapter } from "./types.js";

/**
 * Greenhouse: boards.greenhouse.io/<empresa>/jobs/<id> e
 * job-boards.greenhouse.io — formulário público, sem login.
 */
export const greenhouse: SubmissionAdapter = {
  id: "greenhouse",
  matches: (url) => url.includes("greenhouse.io"),
  submitButtonSelector: 'button[type="submit"], input[type="submit"], button:has-text("Submit application")',
  async navigateToForm(page: Page, jobUrl: string): Promise<void> {
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    // Algumas páginas têm botão "Apply" que revela/rola até o form
    const applyBtn = page
      .locator('a:has-text("Apply"), button:has-text("Apply"), a:has-text("Candidatar")')
      .first();
    if ((await applyBtn.count()) > 0 && (await applyBtn.isVisible().catch(() => false))) {
      const href = await applyBtn.getAttribute("href");
      if (href && href.startsWith("http") && !href.includes("#")) {
        await page.goto(href, { waitUntil: "domcontentloaded", timeout: 45000 });
      } else {
        await applyBtn.click().catch(() => {});
      }
    }
    await page.waitForSelector('input[type="file"], #application, form', { timeout: 20000 });
  },
};

/**
 * Lever: jobs.lever.co/<empresa>/<id> — o form fica em <url>/apply.
 */
export const lever: SubmissionAdapter = {
  id: "lever",
  matches: (url) => url.includes("jobs.lever.co") || url.includes("jobs.eu.lever.co"),
  submitButtonSelector: 'button[type="submit"], button:has-text("Submit application")',
  async navigateToForm(page: Page, jobUrl: string): Promise<void> {
    const applyUrl = jobUrl.replace(/\/?$/, "").endsWith("/apply")
      ? jobUrl
      : `${jobUrl.replace(/\/?$/, "")}/apply`;
    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector('input[type="file"], form', { timeout: 20000 });
  },
};

export const SUBMISSION_ADAPTERS: SubmissionAdapter[] = [greenhouse, lever];

export function findSubmissionAdapter(url: string): SubmissionAdapter | undefined {
  return SUBMISSION_ADAPTERS.find((a) => a.matches(url));
}
