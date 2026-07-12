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

/**
 * Workday: <empresa>.wd<N>.myworkdayjobs.com — o ATS mais hostil à automação
 * (conta por empresa, fluxo multi-step variável). Cobertura parcial por design:
 * navega até o Apply; se houver parede de login, sinaliza para o usuário criar
 * a conta — o preenchimento continua na mesma janela depois do login.
 */
export const workday: SubmissionAdapter = {
  id: "workday",
  matches: (url) => url.includes("myworkdayjobs.com") || url.includes("workday"),
  submitButtonSelector: 'button[data-automation-id="bottom-navigation-next-button"], button:has-text("Submit")',
  async navigateToForm(page: Page, jobUrl: string): Promise<void> {
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const apply = page.locator('a[data-automation-id="adventureButton"], button:has-text("Apply"), a:has-text("Apply")').first();
    if ((await apply.count()) > 0) await apply.click().catch(() => {});
    // "Apply Manually" quando o Workday oferece autofill-with-resume etc.
    const manually = page.locator('a:has-text("Apply Manually"), button:has-text("Apply Manually")').first();
    if ((await manually.count()) > 0 && (await manually.isVisible().catch(() => false))) {
      await manually.click().catch(() => {});
    }
    // parede de login/criação de conta é comum — o runner roda headed, então o
    // usuário consegue logar na própria janela; esperamos o form OU o login
    await page
      .waitForSelector('input[data-automation-id], form, input[type="email"]', { timeout: 30000 })
      .catch(() => {
        throw new Error(
          "Workday não expôs formulário — provavelmente exige conta. Faça login na janela aberta e rode /submeter de novo."
        );
      });
  },
};

export const SUBMISSION_ADAPTERS: SubmissionAdapter[] = [greenhouse, lever, workday];

export function findSubmissionAdapter(url: string): SubmissionAdapter | undefined {
  return SUBMISSION_ADAPTERS.find((a) => a.matches(url));
}
