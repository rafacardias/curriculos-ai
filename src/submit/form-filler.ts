import type { Page, Locator } from "playwright-core";
import { resolveField } from "./field-resolver.js";
import type { SubmissionKit, FillOutcome } from "./types.js";

/**
 * Preenchedor genérico: enumera os controles visíveis do formulário, descobre
 * o label de cada um e resolve o valor pela cascata (identidade →
 * candidate_facts → answer_bank). Campo obrigatório sem resposta conhecida
 * vira "unknown" — quem decide o que fazer é o chamador (pausar, nunca chutar).
 */
export async function fillApplicationForm(page: Page, kit: SubmissionKit): Promise<FillOutcome> {
  const outcome: FillOutcome = { filled: [], unknown: [] };

  // 1. Upload do currículo
  const fileInputs = page.locator('input[type="file"]');
  const fileCount = await fileInputs.count();
  for (let i = 0; i < fileCount; i++) {
    const input = fileInputs.nth(i);
    const label = (await labelFor(page, input)) ?? "";
    if (/resume|curr[íi]culo|cv/i.test(label) || fileCount === 1) {
      await input.setInputFiles(kit.resumePdfPath);
      outcome.filled.push({ field: label || "resume upload", source: "kit" });
      break;
    }
  }

  // 2. Campos de texto e textareas
  const controls = page.locator(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea'
  );
  const n = await controls.count();
  for (let i = 0; i < n; i++) {
    const control = controls.nth(i);
    if (!(await control.isVisible().catch(() => false))) continue;
    const current = await control.inputValue().catch(() => "");
    if (current) continue; // não sobrescreve autofill/valores existentes

    const label = await labelFor(page, control);
    if (!label) continue;

    // cover letter tem tratamento próprio
    if (/cover letter|carta de apresenta/i.test(label) && kit.coverLetterText) {
      await control.fill(kit.coverLetterText);
      outcome.filled.push({ field: label, source: "kit" });
      continue;
    }

    const resolved = resolveField(label, kit.profile, kit.language);
    if (resolved) {
      await control.fill(resolved.value);
      outcome.filled.push({ field: label, source: resolved.source });
    } else if (await isRequired(control)) {
      outcome.unknown.push(label);
    }
  }

  // 3. Selects e radios obrigatórios sem resposta conhecida → unknown
  const selects = page.locator("select");
  const sn = await selects.count();
  for (let i = 0; i < sn; i++) {
    const sel = selects.nth(i);
    if (!(await sel.isVisible().catch(() => false))) continue;
    const label = await labelFor(page, sel);
    if (!label) continue;
    const resolved = resolveField(label, kit.profile, kit.language);
    if (resolved) {
      // tenta casar a option pelo texto
      const matched = await sel
        .selectOption({ label: resolved.value })
        .then(() => true)
        .catch(() => false);
      if (matched) {
        outcome.filled.push({ field: label, source: resolved.source });
        continue;
      }
    }
    if (await isRequired(sel)) outcome.unknown.push(label);
  }

  return outcome;
}

/** Descobre o texto do label de um controle (for=, aria-label, ancestral <label>, placeholder). */
async function labelFor(page: Page, control: Locator): Promise<string | null> {
  const aria = await control.getAttribute("aria-label");
  if (aria) return aria.trim();

  const id = await control.getAttribute("id");
  if (id) {
    const byFor = page.locator(`label[for="${cssEscape(id)}"]`).first();
    if ((await byFor.count()) > 0) {
      const t = (await byFor.textContent())?.trim();
      if (t) return cleanLabel(t);
    }
  }

  const ancestor = control.locator("xpath=ancestor::label[1]");
  if ((await ancestor.count()) > 0) {
    const t = (await ancestor.textContent())?.trim();
    if (t) return cleanLabel(t);
  }

  const labelledBy = await control.getAttribute("aria-labelledby");
  if (labelledBy) {
    const t = (
      await page
        .locator(`#${cssEscape(labelledBy.split(/\s+/)[0] ?? "")}`)
        .first()
        .textContent()
        .catch(() => null)
    )?.trim();
    if (t) return cleanLabel(t);
  }

  const placeholder = await control.getAttribute("placeholder");
  if (placeholder) return placeholder.trim();
  const name = await control.getAttribute("name");
  return name ? name.replace(/[_\-.]/g, " ").trim() : null;
}

async function isRequired(control: Locator): Promise<boolean> {
  const required = await control.getAttribute("required");
  const ariaRequired = await control.getAttribute("aria-required");
  return required !== null || ariaRequired === "true";
}

function cleanLabel(t: string): string {
  return t.replace(/\s+/g, " ").replace(/\s*\*\s*$/, "").trim().slice(0, 200);
}

function cssEscape(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}
