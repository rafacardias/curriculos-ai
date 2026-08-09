/**
 * Vigilância por empresa — Gupy (Fase A).
 *
 * NÃO é um `JobSourceAdapter`: o board por empresa é outro host
 * (`<handle>.gupy.io/api/v1/jobs`, sem `jobName`) e essa função não passa pelo
 * `resolveAdapters`/`runSearch` — a decisão de arquitetura está registrada no
 * plano da feature e no KNOWN-BUGS.md (o contrato de busca-por-termo não cabe
 * vigilância sem gambiarra). Reusa `Schema`/`REMOTE_MAP` de `gupy.ts` porque o
 * shape da resposta é o mesmo backend, só o endpoint muda.
 *
 * Sem paginação nesta fase: um único request com `limit` alto. Empresa com mais
 * vagas abertas que o limite perde as excedentes — limitação real, registrada
 * aqui, não escondida.
 */
import { Schema, REMOTE_MAP } from "./gupy.js";
import { fetchJson, stripHtml, detectLanguage } from "./types.js";
import type { RawJob } from "../core/types.js";

const PAGE_LIMIT = 200;

export interface CompanyFetchResult {
  jobs: RawJob[];
  error: string | null;
  /** Quantas vagas vieram com modalidade estruturada (isRemoteWork/workplaceType) vs. NULL. */
  modalityStats: { withModality: number; withoutModality: number };
}

/**
 * O `id` da Gupy não é necessariamente único GLOBALMENTE — é o id do board da
 * empresa, e duas empresas diferentes poderiam coincidir num mesmo número. Como
 * `source` é o mesmo literal ("gupy-watch") pra todas as empresas vigiadas (a
 * distinção é por `company_name`/`company_id`, não por `source`), o dedup por
 * `(source, source_job_id)` em `insertJob` colapsaria vagas de empresas
 * diferentes se não prefixássemos aqui. Custa nada, remove a ambiguidade.
 */
function scopedSourceJobId(handle: string, id: string | number): string {
  return `${handle}:${id}`;
}

export async function fetchGupyCompanyJobs(handle: string): Promise<CompanyFetchResult> {
  try {
    const data = Schema.parse(
      await fetchJson(`https://${handle}.gupy.io/api/v1/jobs?limit=${PAGE_LIMIT}&offset=0`)
    );

    let withModality = 0;
    let withoutModality = 0;

    const jobs: RawJob[] = data.data
      .filter((j) => j.jobUrl)
      .map((j) => {
        const description = j.description ? stripHtml(j.description) : undefined;
        const remoteType =
          j.isRemoteWork === true
            ? ("remote" as const)
            : j.workplaceType
              ? REMOTE_MAP[j.workplaceType.toLowerCase()]
              : undefined;
        if (remoteType) withModality++;
        else withoutModality++;

        return {
          source: "gupy-watch" as const,
          sourceJobId: scopedSourceJobId(handle, j.id),
          url: j.jobUrl!,
          title: j.name,
          companyName: j.careerPageName ?? j.companyName ?? "?",
          location: [j.city, j.state].filter(Boolean).join(", ") || undefined,
          remoteType,
          description,
          rawHtml: j.description ?? undefined,
          language: description ? detectLanguage(description) : ("pt" as const),
          postedAt: j.publishedDate ?? undefined,
        };
      });

    return { jobs, error: null, modalityStats: { withModality, withoutModality } };
  } catch (err) {
    return { jobs: [], error: String(err), modalityStats: { withModality: 0, withoutModality: 0 } };
  }
}
