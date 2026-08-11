import { z } from "zod";
import type { JobSourceAdapter, SearchParams, AdapterResult } from "./types.js";
import { fetchJson, stripHtml, detectLanguage } from "./types.js";
import { resolveLocality } from "../core/locality.js";

// Endpoint público do job board da Gupy — não documentado/versionado.
// Validamos o shape com zod e falhamos alto em vez de inserir lixo.
//
// `Schema` e `REMOTE_MAP` são exportados porque `src/adapters/company-gupy.ts`
// (vigilância por empresa) fala com o MESMO backend Gupy, só que pelo board por
// empresa (`<handle>.gupy.io`) em vez do agregador — o shape da resposta é
// idêntico, então reusa a mesma validação em vez de duplicá-la.
export const Schema = z.object({
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

export const REMOTE_MAP: Record<string, "remote" | "hybrid" | "onsite"> = {
  remote: "remote",
  hybrid: "hybrid",
  "on-site": "onsite",
  presencial: "onsite",
};

export const gupy: JobSourceAdapter = {
  id: "gupy",
  // A Gupy resolve os dois no servidor: `city=` e `workplaceType=remote`.
  //
  // `city=` é o único recorte geográfico que a fonte tem, e ele é MATCH EXATO e
  // CASE-SENSITIVE contra o nome da cidade (medido 2026-08-11: `Belo Horizonte`
  // → 10 vagas; `belo horizonte` → 0; `BELO HORIZONTE` → 0; `state=MG` → 0;
  // `city=Brazil` → 0). Ou seja: valor errado não dá erro, dá silêncio — e as 7
  // buscas PT do config hoje mandam `location: Brazil`, que zeraria a fonte.
  //
  // Por isso `location` passa por `resolveLocality` ANTES de virar `city=`: só
  // vai pra URL o que resolve como cidade. País/UF/desconhecido não viram
  // `city=` inventado — viram `ignored`, dito em voz alta. O valor enviado é o
  // LITERAL do config, nunca o normalizado do léxico (minúscula devolve 0).
  capabilities: { location: true, remoteOnly: true, allRemote: false },
  async search({ query, location, remoteOnly, limit = 50 }: SearchParams): Promise<AdapterResult> {
    const ignored: string[] = [];
    try {
      const params = [`jobName=${encodeURIComponent(query)}`, `limit=${limit}`, "offset=0"];
      let cityApplied = false;
      if (location) {
        const loc = resolveLocality(location);
        if (loc.level === "city") {
          params.push(`city=${encodeURIComponent(location)}`);
          cityApplied = true;
        } else {
          ignored.push(
            `location "${location}" resolveu como ${loc.level}, não cidade — a Gupy só recorta ` +
              `por cidade (city=), então a busca foi feita SEM recorte geográfico`
          );
        }
      }
      if (remoteOnly) params.push("workplaceType=remote");
      const data = Schema.parse(
        await fetchJson(`https://employability-portal.gupy.io/api/v1/jobs?${params.join("&")}`)
      );
      // Zero resultado com `city=` aplicado é ambíguo: ou não há vaga, ou o nome
      // não bate byte a byte com o que a Gupy guarda. Dizer isso é o que impede o
      // match exato de falhar em silêncio.
      if (cityApplied && data.data.length === 0) {
        ignored.push(
          `city="${location}" devolveu 0 vagas — pode ser ausência de vaga OU nome que não ` +
            `casa exatamente com o da Gupy (o filtro é case-sensitive, sem acento não casa)`
        );
      }
      return {
        ignored,
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
      return { jobs: [], errors: [String(err)], ignored };
    }
  },
};
