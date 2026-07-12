import { z } from "zod";
import type { JobSourceAdapter, SearchParams, AdapterResult } from "./types.js";
import { fetchJson, stripHtml, detectLanguage } from "./types.js";

// Endpoint público do job board da Gupy — não documentado/versionado.
// Validamos o shape com zod e falhamos alto em vez de inserir lixo.
const Schema = z.object({
  data: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      name: z.string(),
      careerPageName: z.string().optional(),
      companyName: z.string().optional(),
      city: z.string().nullable().optional(),
      state: z.string().nullable().optional(),
      workplaceType: z.string().nullable().optional(),
      isRemoteWork: z.boolean().optional(),
      jobUrl: z.string().optional(),
      description: z.string().nullable().optional(),
      publishedDate: z.string().nullable().optional(),
    })
  ),
});

const REMOTE_MAP: Record<string, "remote" | "hybrid" | "onsite"> = {
  remote: "remote",
  hybrid: "hybrid",
  "on-site": "onsite",
  presencial: "onsite",
};

export const gupy: JobSourceAdapter = {
  id: "gupy",
  async search({ query, limit = 50 }: SearchParams): Promise<AdapterResult> {
    try {
      const data = Schema.parse(
        await fetchJson(
          `https://employability-portal.gupy.io/api/v1/jobs?jobName=${encodeURIComponent(query)}&limit=${limit}&offset=0`
        )
      );
      return {
        jobs: data.data
          .filter((j) => j.jobUrl)
          .map((j) => {
            const description = j.description ? stripHtml(j.description) : undefined;
            return {
              source: "gupy" as const,
              sourceJobId: String(j.id),
              url: j.jobUrl!,
              title: j.name,
              companyName: j.careerPageName ?? j.companyName ?? "?",
              location: [j.city, j.state].filter(Boolean).join(", ") || undefined,
              remoteType:
                j.isRemoteWork === true
                  ? ("remote" as const)
                  : j.workplaceType
                    ? REMOTE_MAP[j.workplaceType.toLowerCase()]
                    : undefined,
              description,
              rawHtml: j.description ?? undefined,
              language: description ? detectLanguage(description) : ("pt" as const),
              postedAt: j.publishedDate ?? undefined,
            };
          }),
        errors: [],
      };
    } catch (err) {
      return { jobs: [], errors: [String(err)] };
    }
  },
};
