import { z } from "zod";
import type { JobSourceAdapter, SearchParams, AdapterResult } from "./types.js";
import { fetchJson, stripHtml, detectLanguage } from "./types.js";

const Schema = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      url: z.string(),
      title: z.string(),
      company_name: z.string(),
      candidate_required_location: z.string().optional(),
      salary: z.string().optional(),
      description: z.string().optional(),
      publication_date: z.string().optional(),
    })
  ),
});

export const remotive: JobSourceAdapter = {
  id: "remotive",
  async search({ query, limit = 50 }: SearchParams): Promise<AdapterResult> {
    try {
      const data = Schema.parse(
        await fetchJson(
          `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=${limit}`
        )
      );
      return {
        jobs: data.jobs.map((j) => ({
          source: "remotive" as const,
          sourceJobId: String(j.id),
          url: j.url,
          title: j.title,
          companyName: j.company_name,
          location: j.candidate_required_location,
          remoteType: "remote" as const,
          salaryRaw: j.salary || undefined,
          description: j.description ? stripHtml(j.description) : undefined,
          rawHtml: j.description,
          language: j.description ? detectLanguage(stripHtml(j.description)) : "en",
          postedAt: j.publication_date,
        })),
        errors: [],
      };
    } catch (err) {
      return { jobs: [], errors: [String(err)] };
    }
  },
};
