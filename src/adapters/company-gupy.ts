/**
 * Vigilância por empresa — Gupy (Fase A).
 *
 * NÃO É UM ENDPOINT PÚBLICO. Não existe API JSON por empresa
 * (`<handle>.gupy.io/api/v1/jobs` é 404 de verdade — verificado ao vivo contra
 * Localiza e Algar nesta sessão; a primeira versão deste arquivo assumia
 * errado). O que existe é a página do board (`<handle>.gupy.io/`), server-
 * renderizada em Next.js, com as vagas embutidas no `<script
 * id="__NEXT_DATA__">` do HTML. Isto não é integração estável — é SCRAPE
 * ESTRUTURADO: quebra sem aviso se a Gupy mudar o build do Next ou o shape de
 * `pageProps`. `ats: "gupy"` em `companies-config.ts` é best-effort declarado,
 * mesmo tratamento que a Fase B vai dar ao caso "sem ATS" (Sabin — HTML
 * próprio). Falha de parse aqui SEMPRE vira `error` (linha de erro no inbox
 * via o orquestrador) — nunca uma exceção que aborta o lote.
 *
 * Consequência pra ordem da Fase B (registrada, não muda a ordem agora): se
 * Gupy já é scrape, Greenhouse (API JSON real, versionada) passa a ser o
 * único adapter genuinamente estável desta feature.
 *
 * SEM DESCRIÇÃO. `pageProps.jobs` não traz o texto do anúncio — só
 * title/department/workplace. Buscar a descrição de cada vaga exigiria um
 * segundo request por vaga (até 806, só pra uma empresa) — fora do escopo
 * "núcleo mínimo" da Fase A. `department` (quando presente) entra no campo
 * `description` do `RawJob` só pra dar ao filtro léxico do orquestrador um
 * pouco mais que o título sozinho — o filtro da Fase A é TÍTULO+DEPARTAMENTO,
 * não JD completo, e isso é uma limitação real (falso-negativo em vaga cujo
 * título não menciona a keyword), registrada no KNOWN-BUGS.md, não escondida.
 *
 * `workplace.workplaceType` (`remote`/`hybrid`/`on-site`) mapeia direto no
 * `REMOTE_MAP` que `gupy.ts` já tem — mesmos três valores do agregador.
 */
import { z } from "zod";
import { REMOTE_MAP } from "./gupy.js";
import { fetchText, detectLanguage } from "./types.js";
import type { RawJob } from "../core/types.js";

const NextDataSchema = z.object({
  props: z.object({
    pageProps: z.object({
      careerPage: z.object({ name: z.string() }).optional(),
      jobs: z.array(
        z.object({
          id: z.union([z.string(), z.number()]),
          title: z.string(),
          type: z.string().optional(),
          department: z.string().nullable().optional(),
          workplace: z
            .object({
              workplaceType: z.string().nullable().optional(),
              address: z
                .object({
                  city: z.string().nullable().optional(),
                  stateShortName: z.string().nullable().optional(),
                })
                .nullable()
                .optional(),
            })
            .nullable()
            .optional(),
        })
      ),
    }),
  }),
});

const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/** "banco de talentos" não é vaga aberta — não deveria virar candidatura possível. */
const TALENT_POOL_TYPE = "vacancy_type_talent_pool";

/** Distribuição de `workplaceType` — o número que decide se o gargalo do exit 5 encolhe. */
export interface ModalityDistribution {
  remote: number;
  hybrid: number;
  onsite: number;
  /** `workplaceType` ausente/null — sem exemplo real nesta sessão (0/782 vagas efetivas checadas), mas o código não assume que nunca acontece. */
  none: number;
}

export interface CompanyFetchResult {
  jobs: RawJob[];
  error: string | null;
  modalityStats: ModalityDistribution;
}

/** O `id` da Gupy é escopado por empresa, não global — ver `insertJob` (007_watch_dedup.sql). */
function scopedSourceJobId(handle: string, id: string | number): string {
  return `${handle}:${id}`;
}

export async function fetchGupyCompanyJobs(handle: string): Promise<CompanyFetchResult> {
  const emptyDist: ModalityDistribution = { remote: 0, hybrid: 0, onsite: 0, none: 0 };
  try {
    const html = await fetchText(`https://${handle}.gupy.io/`);
    const match = html.match(NEXT_DATA_RE);
    if (!match) {
      return {
        jobs: [],
        error: `__NEXT_DATA__ não encontrado em ${handle}.gupy.io — layout do board mudou? (scrape, não API — ver comentário do arquivo)`,
        modalityStats: emptyDist,
      };
    }
    const parsed = NextDataSchema.parse(JSON.parse(match[1]!));
    const { careerPage, jobs: rawJobs } = parsed.props.pageProps;
    const companyName = careerPage?.name ?? handle;

    const dist: ModalityDistribution = { remote: 0, hybrid: 0, onsite: 0, none: 0 };

    const jobs: RawJob[] = rawJobs
      .filter((j) => j.type !== TALENT_POOL_TYPE)
      .map((j) => {
        const wpType = j.workplace?.workplaceType;
        const remoteType = wpType ? REMOTE_MAP[wpType.toLowerCase()] : undefined;
        if (remoteType === "remote") dist.remote++;
        else if (remoteType === "hybrid") dist.hybrid++;
        else if (remoteType === "onsite") dist.onsite++;
        else dist.none++;

        return {
          source: "gupy-watch" as const,
          sourceJobId: scopedSourceJobId(handle, j.id),
          url: `https://${handle}.gupy.io/jobs/${j.id}?jobBoardSource=gupy_public_page`,
          title: j.title,
          companyName,
          location: [j.workplace?.address?.city, j.workplace?.address?.stateShortName]
            .filter(Boolean)
            .join(", ") || undefined,
          remoteType,
          // Único texto além do título disponível sem um 2º request por vaga —
          // ver o comentário do arquivo sobre o filtro léxico título+department.
          description: j.department ?? undefined,
          language: detectLanguage(j.title),
        };
      });

    return { jobs, error: null, modalityStats: dist };
  } catch (err) {
    return { jobs: [], error: String(err), modalityStats: emptyDist };
  }
}
