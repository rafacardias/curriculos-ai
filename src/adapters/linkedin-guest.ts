import type { JobSourceAdapter, SearchParams, AdapterResult } from "./types.js";
import { fetchText, stripHtml, detectLanguage } from "./types.js";
import type { RawJob } from "../core/types.js";

/**
 * LinkedIn guest search — endpoints públicos SEM login (não arrisca a conta).
 * O MAIS FRÁGIL dos adapters: anti-bot agressivo, HTML muda sem aviso.
 * Quando bloquear, o fallback permanente é /vaga <url>.
 */
export const linkedinGuest: JobSourceAdapter = {
  id: "linkedin",
  async search({ query, location, limit = 25 }: SearchParams): Promise<AdapterResult> {
    try {
      const url =
        `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` +
        `?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location ?? "Brazil")}&start=0`;
      const html = await fetchText(url, 20000);

      const jobs: RawJob[] = [];
      for (const m of html.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
        if (jobs.length >= limit) break;
        const card = m[1] ?? "";
        const link = card.match(/href="(https:\/\/[a-z]{2,3}\.linkedin\.com\/jobs\/view\/[^"?]+)/)?.[1];
        const title = card.match(/base-search-card__title[^>]*>([\s\S]*?)</)?.[1]?.trim();
        const company = card.match(/base-search-card__subtitle[^>]*>[\s\S]*?>([\s\S]*?)</)?.[1]?.trim();
        const loc = card.match(/job-search-card__location[^>]*>([\s\S]*?)</)?.[1]?.trim();
        const date = card.match(/datetime="([^"]+)"/)?.[1];
        if (!link || !title || !company) continue;
        jobs.push({
          source: "linkedin",
          url: link,
          title: stripHtml(title),
          companyName: stripHtml(company),
          location: loc ? stripHtml(loc) : undefined,
          postedAt: date,
          language: detectLanguage(`${title} ${loc ?? ""}`),
        });
      }

      // Busca a descrição das primeiras N (página guest de cada vaga)
      const detailLimit = Math.min(jobs.length, 10);
      for (let i = 0; i < detailLimit; i++) {
        try {
          const pageHtml = await fetchText(jobs[i]!.url, 15000);
          const desc = pageHtml.match(
            /show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/
          )?.[1];
          if (desc) {
            jobs[i]!.rawHtml = desc;
            jobs[i]!.description = stripHtml(desc);
            jobs[i]!.language = detectLanguage(jobs[i]!.description!);
          }
        } catch {
          /* detalhe é best-effort — a vaga entra mesmo sem descrição */
        }
      }

      const errors = jobs.length === 0 ? ["0 vagas — provável bloqueio anti-bot; use /vaga <url> como fallback"] : [];
      return { jobs, errors };
    } catch (err) {
      return { jobs: [], errors: [`${String(err)} — LinkedIn guest bloqueado? Fallback: /vaga <url>`] };
    }
  },
};
