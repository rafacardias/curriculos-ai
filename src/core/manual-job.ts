/**
 * Adicionar vaga por URL — o caminho compartilhado entre a CLI e a UI.
 *
 * `search.ts --url` já fazia isto, mas dentro do próprio arquivo da CLI: a UI não
 * tinha como chamar sem duplicar a sequência (baixar → inserir → pontuar). É a
 * mesma armadilha do `hardFilterReason` e do `applyFeedback` — dois caminhos que
 * precisam concordar acabam divergindo — então a lógica sai para cá antes de
 * ganhar o segundo chamador, não depois.
 *
 * A EXTRAÇÃO É RUIM POR NATUREZA. O `manual-url` baixa qualquer página e adivinha
 * título pela tag `<title>`, o que produz coisas como
 * "Página da Vaga | Especialista em Automação e IA" e empresa "?". Por isso a
 * função DEVOLVE um diagnóstico em vez de fingir sucesso: quem chama decide se
 * pede correção ao humano. Aceitar "?" como nome de empresa em silêncio geraria
 * um kit endereçado a ninguém.
 */
import { fetchManualUrl } from "../adapters/manual-url.js";
import {
  insertJob,
  getJob,
  getJobByUrl,
  updateManualJobDetails,
  findExistingJob,
  type JobRow,
} from "../db/repo/jobs.js";
import { getApplicationByJob } from "../db/repo/applications.js";
import { scoreNewJobs, hardFilterReason, type ScoredJob } from "./scoring.js";
import type { AppConfig } from "./config.js";

export interface ManualJobResult {
  ok: boolean;
  /** Motivo, quando `ok` é falso. */
  error?: string;
  job?: JobRow;
  /** `true` quando a URL já existia e esta chamada corrigiu a linha (não inseriu outra). */
  updated?: boolean;
  scored?: ScoredJob;
  /** Filtro duro que a vaga dispara, se algum. Não impede — informa. */
  filtered?: string | null;
  /**
   * Problemas de extração que pedem correção humana. A vaga entra do mesmo jeito;
   * o operador decide se re-envia com título e empresa corretos.
   */
  extractionWarnings: string[];
}

/** Título de página não é título de vaga. Marcadores comuns de lixo de `<title>`. */
const TITULO_SUSPEITO =
  /(p[áa]gina da vaga|job (?:page|posting)|carreiras?|careers?|vagas?\s*[|—-]|gupy|greenhouse|lever\.co|workable|\bhome\b)/i;

export async function addJobByUrl(
  config: AppConfig,
  url: string,
  override: { title?: string; companyName?: string } = {}
): Promise<ManualJobResult> {
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "url precisa começar com http:// ou https://", extractionWarnings: [] };
  }
  const result = await fetchManualUrl(url, override);
  if (result.errors.length) {
    return { ok: false, error: result.errors.join("; "), extractionWarnings: [] };
  }
  const raw = result.jobs[0];
  if (!raw) return { ok: false, error: "nada extraído da página", extractionWarnings: [] };

  // Reenvio da mesma URL é o fluxo esperado de correção (a extração avisa
  // "empresa não foi extraída" / "título parece vir da tag <title>" e manda
  // reenviar preenchendo cargo e empresa). Sem esta checagem por URL, cada
  // correção virava uma vaga NOVA — mesmo link, N linhas em `jobs`, cada uma
  // com fingerprint diferente porque o texto corrigido muda o hash.
  const already = getJobByUrl(raw.url);
  let job: JobRow;
  const updated = !!already;
  if (already) {
    if (getApplicationByJob(already.id) || !["new", "queued"].includes(already.status)) {
      return {
        ok: false,
        error:
          `esta URL já está no funil como "${already.title}" @ ${already.company_name} ` +
          `(job_id ${already.id}, status ${already.status}) — já passou de "nova/na fila", ` +
          `reenviar a URL não sobrescreve; edite pelo próprio card`,
        extractionWarnings: [],
      };
    }
    updateManualJobDetails(already.id, {
      title: raw.title,
      companyName: raw.companyName,
      description: raw.description,
    });
    job = getJob(already.id)!;
  } else {
    const inserted = insertJob(raw);
    if (!inserted) {
      const existing = findExistingJob(raw);
      const detail = existing
        ? ` — parece a mesma vaga de "${existing.title}" @ ${existing.company_name} (job_id ${existing.id}, status ${existing.status}, url ${existing.url})`
        : "";
      return {
        ok: false,
        error: `vaga já existe no banco (mesma empresa+cargo já cadastrados)${detail}`,
        extractionWarnings: [],
      };
    }
    job = inserted;
  }

  const avisos: string[] = [];
  if (!override.companyName && (raw.companyName === "?" || raw.companyName.length < 2)) {
    avisos.push("empresa não foi extraída — informe o nome, senão a carta sai endereçada a ninguém");
  }
  if (!override.title && TITULO_SUSPEITO.test(raw.title)) {
    avisos.push(`título parece vir da tag <title> da página ("${raw.title.slice(0, 60)}") — informe o cargo real`);
  }
  if (!raw.description || raw.description.length < 400) {
    avisos.push("descrição curta ou ausente — a página pode ter bloqueado o robô; cole o texto do anúncio");
  }

  const scored = scoreNewJobs(config, [job.id])[0];
  const jobFinal = getJob(job.id)!;
  return {
    ok: true,
    job: jobFinal,
    updated,
    scored,
    filtered: hardFilterReason(config, jobFinal),
    extractionWarnings: avisos,
  };
}
