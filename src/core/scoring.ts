import { getDb } from "../db/client.js";
import { termsPresent, tokenize } from "./keywords.js";
import { detectRequiredYears, normalize } from "./dedup.js";
import { decidePolicy } from "./policy.js";
import {
  getJob,
  listRescorableJobs,
  updateJobRescore,
  updateJobScore,
  type JobRow,
} from "../db/repo/jobs.js";
import { resolveLocality, declaresEligibleRegion } from "./locality.js";
import { nowIso } from "../db/client.js";
import type { AppConfig } from "./config.js";

export interface ScoredJob {
  jobId: string;
  title: string;
  company: string;
  score: number;
  scoreDetail: Record<string, number>;
  trackHint: string | null;
  policyAction: string;
  status: "new" | "queued";
}

interface TrackRow {
  id: string;
  keywords: string;
}

/**
 * Score determinístico 0-100 por componentes ponderados (config.scoring).
 * Sem trilhas no DB (perfil ainda não ingerido), o overlap usa os termos do
 * próprio título como proxy fraco — o sistema funciona, mas pontua baixo.
 */
export function scoreJob(config: AppConfig, job: JobRow): { score: number; detail: Record<string, number>; trackHint: string | null } {
  const db = getDb();
  const w = config.scoring;
  const text = `${job.title} ${job.description ?? ""}`;

  // 1. keyword_overlap × melhor trilha
  const tracks = db.prepare("SELECT id, keywords FROM profile_tracks").all() as unknown as TrackRow[];
  let trackHint: string | null = null;
  let overlap = 0;
  if (tracks.length) {
    for (const t of tracks) {
      const kws: string[] = JSON.parse(t.keywords);
      if (!kws.length) continue;
      const hits = termsPresent(text, kws).length;
      const frac = hits / Math.min(kws.length, 15); // satura: 15 keywords batendo = overlap pleno
      if (frac > overlap) {
        overlap = Math.min(frac, 1);
        trackHint = t.id;
      }
    }
  } else {
    overlap = Math.min(tokenize(job.title).length > 0 ? 0.3 : 0, 1);
  }

  // 2. recência (decai em 21 dias, com piso de calibração)
  //
  // O piso (`scoring.recency_floor`) não afrouxa o critério de frescor: ele impede
  // que o componente desapareça da ESCALA quando todo o acervo está fora da janela
  // de 21 dias. Sem ele, um acervo velho zera 15 pontos para todas as vagas e
  // descalibra `queue_threshold` e `generate_min_score` sem ninguém tocá-los. A
  // discriminação real segue existindo só entre 0 e 21 dias — ver config.yaml.
  //
  // `posted_at` ausente continua valendo 0.5 (desconhecido ≠ velho).
  let recency = 0.5;
  if (job.posted_at) {
    const ageDays = (Date.now() - new Date(job.posted_at).getTime()) / 86400_000;
    recency = Math.max(w.recency_floor, Math.min(1, 1 - ageDays / 21));
  }

  // 3. fit de local/remoto — hierarquia cidade → UF → país (BUG-006)
  //
  // Antes: `remote_type === 'remote'` dava 1.0 direto, e o Brasil só era
  // reconhecido pela palavra "Brasil"/"Brazil" na string. Isso produzia o
  // resultado invertido que a fila mostrava: "São Paulo, SP" caía no default 0.5
  // enquanto uma vaga de bombeiro de aeroporto em Mangaluru marcada `remote` pelo
  // RemoteOK levava 1.0.
  //
  // A flag `remote` da fonte não é evidência de elegibilidade. O RemoteOK marca
  // 100% do catálogo como remoto — uma constante, e constante não carrega
  // informação. Por isso remoto sem corroboração de região vale 0.6: incerto, nem
  // premiado nem punido.
  const loc = resolveLocality(job.location);
  const isRemote = job.remote_type === "remote";
  let locationFit: number;
  if (loc.isHome) {
    // Resolveu para o país do operador, em qualquer nível da hierarquia.
    if (isRemote) locationFit = 1; // remoto no próprio país: onde fica é irrelevante
    else if (loc.isHomeUf) locationFit = 1; // presencial/híbrido na UF onde ele mora
    else locationFit = 0.7; // presencial em outra UF: exigiria mudança
  } else if (isRemote) {
    locationFit = declaresEligibleRegion(`${job.location ?? ""}\n${job.description ?? ""}`) ? 1 : 0.6;
  } else if (loc.level === "foreign") {
    locationFit = 0.1; // presencial fora do país, sem elegibilidade nenhuma
  } else {
    locationFit = 0.5; // nenhuma informação de localidade
  }

  // 4. fit de idioma (pt e en são ambos ok para o Rafael)
  const languageFit = job.language === "pt" || job.language === "en" ? 1 : 0.5;

  // 5. preferências aprendidas (feedback)
  const prefRows = db.prepare("SELECT key, weight FROM preference_weights").all() as Array<{ key: string; weight: number }>;
  let prefSum = 0;
  if (prefRows.length) {
    const textNorm = text.toLowerCase();
    for (const { key, weight } of prefRows) {
      const [kind, value] = key.split(":", 2);
      if (!value) continue;
      const match =
        (kind === "kw" && textNorm.includes(value)) ||
        (kind === "company" && job.company_name.toLowerCase().includes(value)) ||
        (kind === "source" && job.source === value) ||
        (kind === "seniority" && job.seniority === value);
      if (match) prefSum += weight;
    }
  }
  const preference = Math.max(-1, Math.min(1, prefSum / config.preferences.max_weight)) / 2 + 0.5;

  const detail: Record<string, number> = {
    keyword_overlap: round2(overlap * w.keyword_overlap * 100),
    recency: round2(recency * w.recency * 100),
    location_fit: round2(locationFit * w.location_fit * 100),
    language_fit: round2(languageFit * w.language_fit * 100),
    preference: round2(preference * w.preference * 100),
  };
  const score = round2(Object.values(detail).reduce((a, b) => a + b, 0));
  return { score, detail, trackHint };
}

/** Pontua vagas recém-inseridas, aplica o policy engine e enfileira as acima do threshold. */
export function scoreNewJobs(config: AppConfig, jobIds: string[]): ScoredJob[] {
  const results: ScoredJob[] = [];
  for (const id of jobIds) {
    const job = getJob(id);
    if (!job) continue;
    const { score, detail, trackHint } = scoreJob(config, job);
    const policy = decidePolicy(config, job, score, trackHint);
    const filtered = hardFilterReason(config, job);
    const status: "new" | "queued" = !filtered && score >= config.queue_threshold ? "queued" : "new";
    updateJobScore(id, score, detail, trackHint, filtered ?? policy.action, status);
    results.push({
      jobId: id,
      title: job.title,
      company: job.company_name,
      score,
      scoreDetail: detail,
      trackHint,
      policyAction: filtered ?? policy.action,
      status,
    });
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Filtros duros do config: senioridade excluída, palavra barrada no título ou
 * anos exigidos acima do teto. Retorna o motivo, ou null se a vaga passa.
 *
 * Vive numa função só porque DOIS caminhos precisam dela — `scoreNewJobs` (na
 * coleta) e `rescoreAll` (na repontuação do acervo). Duplicar a cascata faria os
 * dois divergirem silenciosamente no dia em que um filtro novo entrasse.
 */
export function hardFilterReason(config: AppConfig, job: JobRow): string | null {
  if (job.seniority && config.filters.exclude_seniority.includes(job.seniority)) {
    return `filtrado: senioridade ${job.seniority}`;
  }
  const badKeyword = titleKeywordHit(job.title, config.filters.exclude_title_keywords);
  if (badKeyword) return `filtrado: título contém "${badKeyword}"`;
  const idioma = blockingNativeLanguage(config, job);
  if (idioma) return `filtrado: exige ${idioma} nativo`;
  const tech = blockingTechnology(config, job);
  if (tech) return `filtrado: exige ${tech} (não está no perfil)`;
  if (config.filters.exclude_onsite_outside_home_uf && isOnsiteOutsideHome(job)) {
    return `filtrado: ${job.remote_type} fora de ${resolveLocality(job.location).uf ?? "MG"}`;
  }
  if (config.filters.max_years_required != null) {
    const years = detectRequiredYears(`${job.title}\n${job.description ?? ""}`);
    if (years != null && years > config.filters.max_years_required) {
      return `filtrado: exige ${years}+ anos de experiência`;
    }
  }
  return null;
}

export interface RescoreChange {
  jobId: string;
  title: string;
  company: string;
  source: string;
  location: string | null;
  scoreBefore: number | null;
  scoreAfter: number;
  delta: number;
  statusBefore: string;
  statusAfter: string;
  detailBefore: Record<string, number> | null;
  detailAfter: Record<string, number>;
  policyAction: string;
  trackHint: string | null;
}

export interface RescorePlan {
  scanned: number;
  /** Todas as vagas repontuadas, mudando ou não. */
  all: RescoreChange[];
  /** Só as que mudam score ou status. */
  changed: RescoreChange[];
  entering: RescoreChange[]; // new → queued
  leaving: RescoreChange[]; // queued → new
  committed: boolean;
}

/**
 * Repontua o acervo já coletado com o scorer e o config ATUAIS.
 *
 * Existe porque o score é congelado no insert: sem isto, qualquer melhoria no
 * scorer só alcançaria vagas futuras, e a fila que o operador abre continuaria
 * ordenada pela régua antiga.
 *
 * Escreve APENAS com `commit: true`. O default é planejar e não tocar em nada.
 *
 * Regra de transição: o score é recalculado para `new`, `queued` e `rejected`,
 * mas a transição só ocorre entre `new` ↔ `queued`. Uma vaga `rejected` foi uma
 * DECISÃO do operador — repontuá-la para `queued` desfaria essa decisão pelas
 * costas dele. O score dela é atualizado (para a análise ficar correta), o
 * status não.
 */
export function rescoreAll(config: AppConfig, opts: { commit?: boolean } = {}): RescorePlan {
  const commit = opts.commit === true;
  const at = nowIso();
  const jobs = listRescorableJobs();
  const all: RescoreChange[] = [];

  for (const job of jobs) {
    const { score, detail, trackHint } = scoreJob(config, job);
    // log: false — repontuar 375 vagas não são 375 decisões de política tomadas.
    const policy = decidePolicy(config, job, score, trackHint, { log: false });
    const filtered = hardFilterReason(config, job);
    const statusAfter =
      job.status === "rejected"
        ? "rejected"
        : !filtered && score >= config.queue_threshold
          ? "queued"
          : "new";
    const policyAction = filtered ?? policy.action;

    all.push({
      jobId: job.id,
      title: job.title,
      company: job.company_name,
      source: job.source,
      location: job.location,
      scoreBefore: job.score,
      scoreAfter: score,
      delta: round2(score - (job.score ?? 0)),
      statusBefore: job.status,
      statusAfter,
      detailBefore: parseDetail(job.score_detail),
      detailAfter: detail,
      policyAction,
      trackHint,
    });

    if (commit) {
      updateJobRescore(job.id, score, detail, trackHint, policyAction, statusAfter, at);
    }
  }

  const changed = all.filter((c) => c.scoreBefore !== c.scoreAfter || c.statusBefore !== c.statusAfter);
  return {
    scanned: jobs.length,
    all,
    changed,
    entering: all.filter((c) => c.statusBefore !== "queued" && c.statusAfter === "queued"),
    leaving: all.filter((c) => c.statusBefore === "queued" && c.statusAfter !== "queued"),
    committed: commit,
  };
}

function parseDetail(raw: string | null): Record<string, number> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return null; // score_detail corrompido não pode derrubar a repontuação inteira
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * O JD exige nível NATIVO num idioma que o operador não fala?
 *
 * É requisito eliminatório e o sistema não deve gastar uma geração nele — medido:
 * a vaga da Freedom24 recebeu kit completo, carta e ~$3 de geração antes de alguém
 * ler "Russian: native" na lista de requisitos.
 *
 * Casa as duas ordens porque JD escreve das duas formas: "Russian: native" e
 * "native Russian speaker".
 */
export function blockingNativeLanguage(config: AppConfig, job: JobRow): string | null {
  const idiomas = config.filters.blocking_native_languages;
  if (!idiomas.length || !job.description) return null;
  const texto = job.description.toLowerCase();
  const nivel = "(?:native|nativo|nativa|fluent|fluente|c2|proficien\\w*)";
  for (const lang of idiomas) {
    const l = lang.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`${l}\\s*[:\\-—(]?\\s*${nivel}`, "i").test(texto)) return lang;
    if (new RegExp(`${nivel}\\s+${l}`, "i").test(texto)) return lang;
  }
  return null;
}

/** Marcadores de obrigatoriedade perto da menção. Sem um destes, é menção solta. */
const OBRIGATORIO =
  /(obrigat[óo]ri|essencia|imprescind[íi]ve|requisito|required|must have|s[óo]lid[ao]|forte|avan[çc]ad|profundo|\d+\s*(?:\+|ou mais)?\s*anos?)/i;
/** "Noções de", "básico", "desejável" — menção fraca, não elimina. */
const FRACO = /(no[çc][õo]es|b[áa]sic|desej[áa]ve|diferencial|nice to have|plus|preferencia|familiaridade)/i;
/**
 * Lista de alternativas: "(Node.js, Python ou PHP)" — se ele tem uma, qualifica.
 * O `(?!mais|more)` é obrigatório: sem ele, "3 **ou mais** anos de experiência com
 * Python" era lido como lista de alternativas e a vaga escapava do filtro.
 */
const ALTERNATIVA = /[(,;/]\s*[^(),;]{0,40}\s+(?:ou|or|\/)\s+(?!mais|more)/i;

/**
 * O JD exige, DE VERDADE, uma tecnologia que o operador não tem?
 *
 * Menção não é exigência. Medido em 2026-08-07, amostra de 6 vagas: "Noções de
 * Python" numa lista (a vaga nº 1 da fila) e "Backend para orquestração (Node.js,
 * Python ou PHP)" — onde ele qualifica pelo Node — davam falso positivo num filtro
 * de keyword simples. Dois em seis, e um deles era o topo da fila.
 *
 * Por isso a janela: exige marcador de obrigatoriedade perto, recusa marcador
 * fraco, e ignora quando a tecnologia aparece dentro de uma lista de alternativas.
 * É segmentação pobre — a boa é o REQ-002 — mas é a que cabe sem inventar parser.
 */
export function blockingTechnology(config: AppConfig, job: JobRow): string | null {
  const techs = config.filters.blocking_technologies;
  if (!techs.length || !job.description) return null;
  const texto = `${job.title}\n${job.description}`;
  for (const tech of techs) {
    const re = new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    for (const m of texto.matchAll(re)) {
      const janela = texto.slice(Math.max(0, m.index - 140), m.index + 90);
      if (FRACO.test(janela)) continue;
      if (ALTERNATIVA.test(texto.slice(Math.max(0, m.index - 60), m.index + 40))) continue;
      if (OBRIGATORIO.test(janela)) return tech;
    }
  }
  return null;
}

/**
 * Vaga EXPLICITAMENTE presencial ou híbrida fora da UF do operador.
 *
 * O "explicitamente" é o ponto todo. `remote_type` nulo significa que o adapter
 * não informou — e tratar ausência como prova é o mesmo erro do BUG-006 pelo
 * avesso. Medido: das 24 vagas fora de MG sem flag de remoto, 16 eram NULL do
 * LinkedIn e 5 delas diziam ser remotas no texto do JD.
 */
export function isOnsiteOutsideHome(job: JobRow): boolean {
  if (job.remote_type !== "onsite" && job.remote_type !== "hybrid") return false;
  const loc = resolveLocality(job.location);
  return loc.level !== "unknown" && !loc.isHomeUf;
}

/** Primeira keyword excluída presente no título (palavra inteira, normalizada), ou null. */
function titleKeywordHit(title: string, keywords: string[]): string | null {
  if (!keywords.length) return null;
  const words = new Set(normalize(title).split(" "));
  for (const kw of keywords) {
    const norm = normalize(kw);
    if (!norm) continue;
    // keyword com mais de uma palavra ("nivel iii") → busca de frase; senão, palavra inteira
    if (norm.includes(" ") ? ` ${normalize(title)} `.includes(` ${norm} `) : words.has(norm)) return kw;
  }
  return null;
}

/** Decaimento dos pesos aprendidos — chamado uma vez por execução de busca. */
export function decayPreferenceWeights(config: AppConfig): void {
  const db = getDb();
  db.prepare("UPDATE preference_weights SET weight = weight * ?").run(config.preferences.decay);
  db.prepare("DELETE FROM preference_weights WHERE ABS(weight) < 0.05").run();
}
