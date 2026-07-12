import type { JobSourceAdapter, SearchParams, AdapterResult } from "./types.js";
import { fetchText, stripHtml, detectLanguage } from "./types.js";
import type { RawJob } from "../core/types.js";

/** Extrai itens do RSS do WWR sem dependência de parser XML. */
function parseRssItems(xml: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1] ?? "";
    const field = (tag: string) => {
      const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      let v = match?.[1] ?? "";
      const cdata = v.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      if (cdata) v = cdata[1] ?? "";
      return v.trim();
    };
    items.push({
      title: field("title"),
      link: field("link"),
      description: field("description"),
      pubDate: field("pubDate"),
      region: field("region"),
    });
  }
  return items;
}

export const wwr: JobSourceAdapter = {
  id: "wwr",
  async search({ query, limit = 50 }: SearchParams): Promise<AdapterResult> {
    try {
      const xml = await fetchText("https://weworkremotely.com/remote-jobs.rss");
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const jobs: RawJob[] = parseRssItems(xml)
        .filter((it) => it.title && it.link)
        .filter((it) => {
          if (!terms.length) return true;
          const haystack = `${it.title} ${it.description}`.toLowerCase();
          return terms.every((t) => haystack.includes(t));
        })
        .slice(0, limit)
        .map((it) => {
          // Título do WWR vem como "Empresa: Cargo"
          const sep = it.title!.indexOf(":");
          const companyName = sep > 0 ? it.title!.slice(0, sep).trim() : "?";
          const title = sep > 0 ? it.title!.slice(sep + 1).trim() : it.title!;
          const description = it.description ? stripHtml(it.description) : undefined;
          return {
            source: "wwr" as const,
            url: it.link!,
            title,
            companyName,
            location: it.region || undefined,
            remoteType: "remote" as const,
            description,
            rawHtml: it.description,
            language: description ? detectLanguage(description) : ("en" as const),
            postedAt: it.pubDate ? new Date(it.pubDate).toISOString() : undefined,
          };
        });
      return { jobs, errors: [] };
    } catch (err) {
      return { jobs: [], errors: [String(err)] };
    }
  },
};
