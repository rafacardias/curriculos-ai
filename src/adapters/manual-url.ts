import type { AdapterResult } from "./types.js";
import { fetchText, stripHtml, detectLanguage } from "./types.js";

/**
 * Fallback universal: o usuário cola a URL de qualquer vaga (/vaga <url>).
 * Baixa o HTML e faz extração bruta; título/empresa/JD refinados pelo Claude
 * na skill /vaga podem ser passados como override.
 */
export async function fetchManualUrl(
  url: string,
  override?: { title?: string; companyName?: string; description?: string }
): Promise<AdapterResult> {
  try {
    const html = await fetchText(url, 20000);
    const text = stripHtml(html);
    const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    return {
      jobs: [
        {
          source: "manual",
          url,
          title: override?.title ?? titleTag ?? url,
          companyName: override?.companyName ?? "?",
          description: override?.description ?? text.slice(0, 20000),
          rawHtml: html,
          language: detectLanguage(override?.description ?? text),
        },
      ],
      errors: [],
    };
  } catch (err) {
    return { jobs: [], errors: [String(err)] };
  }
}
