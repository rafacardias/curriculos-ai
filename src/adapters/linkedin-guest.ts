import type { JobSourceAdapter, SearchParams, AdapterResult } from "./types.js";
import { fetchText, stripHtml, detectLanguage } from "./types.js";
import type { RawJob } from "../core/types.js";

/**
 * LinkedIn guest search — endpoints públicos SEM login (não arrisca a conta).
 * O MAIS FRÁGIL dos adapters: anti-bot agressivo, HTML muda sem aviso.
 * Quando bloquear, o fallback permanente é /vaga <url>.
 */

/** O endpoint guest devolve 10 cards por página; `start` é o offset em cards. */
const PAGE_SIZE = 10;
/**
 * Teto de páginas. O pipeline mata o adapter em 30s (ADAPTER_TIMEOUT_MS) e um
 * timeout descarta TODAS as vagas já coletadas — então o teto é orçamento, não
 * ambição: 5 páginas ≈ 50 vagas e cobre `limit` até 50.
 */
const MAX_PAGES = 5;
/** Pausa entre páginas — o endpoint é anti-bot; rajada é o jeito de ser bloqueado. */
const PAGE_PAUSE_MS = 250;
/**
 * Orçamento da paginação dentro dos 30s do pipeline. O que sobra é para o
 * fetch de descrição (N+1, até 10). Estourar o orçamento devolve o que já
 * temos — parcial vale mais que zero, que é o que o timeout do pipeline daria.
 */
const PAGINATION_BUDGET_MS = 12000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Extrai os cards de UMA página de resultados. */
function parseCards(html: string): RawJob[] {
  const jobs: RawJob[] = [];
  for (const m of html.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
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
  return jobs;
}

export const linkedinGuest: JobSourceAdapter = {
  id: "linkedin",
  // `location` vai na URL e a fonte resolve. `remoteOnly` NÃO: o parâmetro
  // `f_WT=2` é aceito e ignorado pelo endpoint guest (mesmo conjunto de cards
  // com e sem ele) — declarar `false` é a documentação honesta da limitação,
  // e quem age é o filtro cliente do pipeline.
  capabilities: { location: true, remoteOnly: false, allRemote: false },
  async search({ query, location, limit = 25 }: SearchParams): Promise<AdapterResult> {
    try {
      const errors: string[] = [];
      const jobs: RawJob[] = [];
      const seen = new Set<string>();
      const deadline = Date.now() + PAGINATION_BUDGET_MS;

      for (let page = 0; page < MAX_PAGES && jobs.length < limit; page++) {
        if (page > 0) {
          if (Date.now() >= deadline) break;
          await sleep(PAGE_PAUSE_MS);
        }
        const url =
          `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` +
          `?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location ?? "Brazil")}` +
          `&start=${page * PAGE_SIZE}`;

        let html: string;
        try {
          html = await fetchText(url, 20000);
        } catch (err) {
          // Falha na 1ª página é a falha da busca — sobe para o catch externo.
          // Nas seguintes já temos vagas em mão: reporta e para.
          if (page === 0) throw err;
          errors.push(`paginação parou em start=${page * PAGE_SIZE}: ${String(err)}`);
          break;
        }

        const before = jobs.length;
        for (const job of parseCards(html)) {
          if (jobs.length >= limit) break;
          if (seen.has(job.url)) continue; // o guest repete card entre páginas
          seen.add(job.url);
          jobs.push(job);
        }
        // Página vazia OU só repetidas = fim do conjunto. Sem isto, um endpoint
        // que devolve sempre a mesma página vira loop até o teto.
        if (jobs.length === before) break;
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

      if (jobs.length === 0) {
        errors.push("0 vagas — provável bloqueio anti-bot; use /vaga <url> como fallback");
      }
      return { jobs, errors };
    } catch (err) {
      return { jobs: [], errors: [`${String(err)} — LinkedIn guest bloqueado? Fallback: /vaga <url>`] };
    }
  },
};
