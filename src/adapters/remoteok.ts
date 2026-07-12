import { z } from "zod";
import type { JobSourceAdapter, SearchParams, AdapterResult } from "./types.js";
import { fetchJson, stripHtml, detectLanguage } from "./types.js";

// O primeiro elemento do array é um aviso legal, não uma vaga.
const JobItem = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  url: z.string().optional(),
  position: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const remoteok: JobSourceAdapter = {
  id: "remoteok",
  async search({ query, limit = 50 }: SearchParams): Promise<AdapterResult> {
    try {
      const raw = z.array(z.unknown()).parse(await fetchJson("https://remoteok.com/api"));
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const jobs = raw
        .slice(1)
        .map((item) => JobItem.safeParse(item))
        .filter((r) => r.success)
        .map((r) => r.data)
        .filter((j) => j.url && j.position && j.company)
        .filter((j) => {
          if (!terms.length) return true;
          const haystack = `${j.position} ${j.tags?.join(" ") ?? ""} ${j.description ?? ""}`.toLowerCase();
          return terms.every((t) => haystack.includes(t));
        })
        .slice(0, limit)
        .map((j) => ({
          source: "remoteok" as const,
          sourceJobId: j.id != null ? String(j.id) : undefined,
          url: j.url!,
          title: j.position!,
          companyName: j.company!,
          location: j.location,
          remoteType: "remote" as const,
          salaryRaw:
            j.salary_min || j.salary_max ? `$${j.salary_min ?? "?"} - $${j.salary_max ?? "?"}` : undefined,
          description: j.description ? stripHtml(j.description) : undefined,
          rawHtml: j.description,
          language: j.description ? detectLanguage(stripHtml(j.description)) : ("en" as const),
          postedAt: j.date,
        }));
      return { jobs, errors: [] };
    } catch (err) {
      return { jobs: [], errors: [String(err)] };
    }
  },
};
