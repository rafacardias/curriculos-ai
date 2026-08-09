/**
 * Servidor local do Curriculos — UI web em http://localhost:4780
 *
 *   npm run ui
 *
 * Reusa o core diretamente (mesmo processo). Ações de julgamento (gerar kit,
 * redigir) continuam no Claude Code — a UI cobre operação e visibilidade.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { WebSocketServer } from "ws";
import pty from "node-pty";
import { parseDocument } from "yaml";
import { z } from "zod";
import { getDb, nowIso, PROJECT_ROOT } from "../db/client.js";
import { loadConfig, CONFIG_PATH, SearchSpec } from "../core/config.js";
import { applySchedule, describeSchedule } from "../local/schedule-ctl.js";
import { runHarness, SessionLimitError, AuthError } from "../local/generate-runner.js";
import { runSearch } from "../core/pipeline.js";
import { resolveAdapters } from "../adapters/index.js";
import { scoreNewJobs, decayPreferenceWeights, hardFilterReason } from "../core/scoring.js";
import { funnelCounts } from "../core/funnel.js";
import { addJobByUrl } from "../core/manual-job.js";
import { blocksGeneration, resolveModality, parseModalityState } from "../core/modality.js";
import { blocksGenerationByScore } from "../core/policy.js";
import { resolveLocality } from "../core/locality.js";
import { confirmModality, confirmScore } from "../db/repo/jobs.js";
import { buildDashboard, DASHBOARD_PATH } from "../dashboard/build.js";
import { setJobStatus, getJob } from "../db/repo/jobs.js";
import { getApplicationByJob, createApplication, setApplicationStatus } from "../db/repo/applications.js";
import { bumpCompanyStat } from "../db/repo/companies.js";
import { listTracks, createTrack, updateTrack } from "../db/repo/profile-tracks.js";
import { ulid } from "ulid";
import { parseReasonClass } from "../core/feedback.js";
import { applyFeedback, hasLearnedFrom, preferenceKeysFor, bumpPreferenceWeights } from "../db/repo/feedback.js";
import type { ApplicationStatus } from "../core/types.js";
import { isAuthorizedUpgrade, newSessionToken } from "./ws-auth.js";

const PORT = 4780;
const APP_HTML = join(PROJECT_ROOT, "src", "server", "app.html");

// Token de sessão do terminal: novo a cada boot, entregue só ao HTML que nós
// servimos. Reiniciar o serviço invalida abas antigas — o cliente detecta o
// código de fechamento e recarrega sozinho para pegar o token novo.
const SESSION_TOKEN = newSessionToken();

let searchState: { running: boolean; startedAt: string | null; lastResult: string | null } = {
  running: false,
  startedAt: null,
  lastResult: null,
};

function json(res: any, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: any): Promise<any> {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

function apiSummary() {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as any)?.n ?? 0;
  const lastRun = db
    .prepare("SELECT started_at, mode, per_source FROM search_runs ORDER BY started_at DESC LIMIT 1")
    .get() as any;
  // Uma definição só, em src/core/funnel.ts. Antes, este endpoint contava
  // `withdrawn` como aplicada e `queued` sem excluir as que já viraram kit.
  const f = funnelCounts();
  return {
    queued: f.queued,
    kits: f.kitReady,
    awaiting: one("SELECT COUNT(*) AS n FROM submissions WHERE status='awaiting_user'"),
    applied: f.applied,
    interviews: f.interviews,
    lastRun: lastRun
      ? { at: lastRun.started_at, mode: lastRun.mode, perSource: lastRun.per_source ? JSON.parse(lastRun.per_source) : null }
      : null,
    searchRunning: searchState.running,
  };
}

function apiQueue(limit: number, track?: string | null) {
  const db = getDb();
  const config = loadConfig();
  return (
    db
      .prepare(
        `SELECT id, title, company_name, url, source, ats_platform, location, remote_type,
                modality_confirmed, modality_confirmed_at, modality_note,
                score_confirmed_at, score_confirmed_note,
                language, seniority, score, score_detail, track_hint, policy_action, posted_at
         FROM jobs
         WHERE status='queued'
           AND id NOT IN (SELECT job_id FROM applications)  -- kit gerado/aprovada = sai da fila
         ORDER BY score DESC LIMIT ?`
      )
      .all(limit) as any[]
  )
    .filter((j) => {
      const p = pipelineItems.get(j.id);
      return !p || p.stage === "erro"; // em erro volta à fila para nova tentativa
    })
    .filter((j) => !track || j.track_hint === track)
    .map((j) => ({
      ...j,
      score_detail: j.score_detail ? JSON.parse(j.score_detail) : null,
      // `modality` é o estado RESOLVIDO — pendente aparece como pendente, nunca
      // como "não é remoto". `blocksGeneration` diz se o Aprovar vai recusar.
      modality: resolveModality(j).state,
      blocksGeneration: blocksGeneration(j, resolveLocality(j.location)) != null,
      blocksScore: blocksGenerationByScore(config, j) != null,
    }));
}

function apiApplications() {
  const db = getDb();
  const config = loadConfig();
  const rows = db
    .prepare(
      `SELECT a.id, a.job_id, a.status, a.applied_at, a.kit_dir, a.submission_mode, a.track_id, a.notes,
              j.title, j.company_name, j.url, j.source, j.ats_platform
       FROM applications a JOIN jobs j ON j.id = a.job_id
       ORDER BY a.updated_at DESC`
    )
    .all() as any[];

  // Kit gerado ANTES de um filtro existir não é confiável só porque está no
  // disco — mesma família da nota de invalidação do 8441497. Quatro dos nove
  // kits atuais são de vagas que as regras de hoje recusam (Python, presencial
  // fora de MG). O selo é CALCULADO na leitura, não gravado: se o operador tirar
  // `python` do config, ele some sozinho — um marcador estático mentiria.
  return rows.map((r) => {
    const job = getJob(r.job_id);
    const stale = job ? hardFilterReason(config, job) : null;
    return { ...r, stale };
  });
}

function apiCompanies() {
  const db = getDb();
  return db
    .prepare(
      `SELECT name, applications_count, responses_count, interviews_count, notes
       FROM companies WHERE applications_count > 0
       ORDER BY CAST(responses_count AS REAL)/MAX(applications_count,1) DESC, applications_count DESC LIMIT 30`
    )
    .all();
}

function logJobEvent(jobId: string, type: string, payload: Record<string, unknown>): void {
  getDb()
    .prepare("INSERT INTO events (id, entity, entity_id, type, payload, created_at) VALUES (?, 'job', ?, ?, ?, ?)")
    .run(ulid(), jobId, type, JSON.stringify(payload), nowIso());
}

function doFeedback(jobId: string, verdict: "aprovar" | "rejeitar", reason?: string, reasonClass?: string) {
  const job = getJob(jobId);
  if (!job) throw new Error("vaga não encontrada");
  const { decision, keys } = applyFeedback({
    job,
    verdict,
    reasonClass: parseReasonClass(reasonClass),
    reason: reason ?? null,
    via: "ui",
  });
  // `learned` volta para a UI de propósito: o operador tem que saber quando o
  // sistema NÃO aprendeu, senão "rejeitei e não mudou nada" vira mistério.
  return { ok: true, keys, learned: decision.learn, why: decision.why };
}

function apiRejected(limit: number) {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT j.id, j.title, j.company_name, j.score, j.source, j.location,
                (SELECT e.payload FROM events e WHERE e.entity_id = j.id AND e.type = 'feedback_reject'
                 ORDER BY e.created_at DESC LIMIT 1) AS reject_payload
         FROM jobs j WHERE j.status = 'rejected' ORDER BY j.score DESC LIMIT ?`
      )
      .all(limit) as any[]
  ).map((r) => ({ ...r, reject_reason: r.reject_payload ? JSON.parse(r.reject_payload).reason : null }));
}

function doRevert(jobId: string) {
  const job = getJob(jobId);
  if (!job) throw new Error("vaga não encontrada");
  if (job.status !== "rejected") throw new Error("vaga não está rejeitada");
  // Só desfaz o aprendizado se a rejeição TIVER aprendido. Uma rejeição por
  // elegibilidade não move peso nenhum; devolvê-la à fila com +1 criaria
  // preferência positiva do nada — o BUG-007 com o sinal trocado.
  const aprendeu = hasLearnedFrom(jobId, "rejeitar");
  if (aprendeu) bumpPreferenceWeights(preferenceKeysFor(job), 1);
  logJobEvent(jobId, "feedback_revert", { via: "ui", desfez_aprendizado: aprendeu });
  setJobStatus(jobId, "queued");
  return { ok: true, desfezAprendizado: aprendeu };
}

/* ── pipeline Aprovar → gerar (claude -p headless) → submeter (modo do config) ──
 * A geração é trabalho de julgamento: roda numa sessão headless do Claude Code
 * (usa a assinatura logada, não a API). A submissão é o submit.ts normal,
 * destacado — em review_first o Chrome abre preenchido e para antes do envio. */
interface PipelineItem {
  jobId: string;
  title: string;
  company: string;
  stage: "aguardando" | "gerando" | "no_chrome" | "concluida" | "erro";
  detail: string | null;
  startedAt: string;
}
const pipelineItems = new Map<string, PipelineItem>();
const pipelineQueue: string[] = [];
let pipelineBusy = false;

const TSX_BIN = join(PROJECT_ROOT, "node_modules", ".bin", "tsx");

/**
 * Geração pelo caminho agêntico.
 *
 * O argv NÃO é montado aqui — vem de `buildHarnessArgv`, o mesmo construtor que
 * o CLI usa. Antes esta função montava a linha de comando à mão, sem `--model`
 * (o modelo saía das settings do usuário) e sem teto de custo. Um teste falha se
 * qualquer arquivo fora de `src/local/harness.ts` voltar a montar argv de
 * `claude`.
 */
async function runClaudeGenerate(jobId: string): Promise<void> {
  const prompt =
    `Execute o fluxo do skill /gerar (arquivo .claude/skills/gerar/SKILL.md) de ponta a ponta para a vaga ${jobId}, ` +
    `de forma 100% autônoma, sem fazer nenhuma pergunta. A REGRA Nº 1 (veracidade, citações [exp:id]) vale integralmente. ` +
    `Se faltar um candidate_fact, escreva [CONFIRMAR: ...] no answers.md e prossiga. ` +
    `Só termine depois que "npx tsx src/cli/kit.ts finalize ${jobId}" passar. NÃO execute /submeter. ` +
    `Rode comandos Bash um por um (sem encadear com && ou ;) — comandos compostos são bloqueados pela permissão headless.`;

  const perfil = loadConfig().harness.profiles["agentic"];
  if (!perfil) throw new Error('perfil de harness "agentic" não existe em config/config.yaml');

  const logPath = join(PROJECT_ROOT, "logs", `pipeline-${jobId}.log`);
  let run;
  try {
    run = await runHarness("agentic", perfil, {
      prompt,
      // stream-json + verbose: 1 evento por linha, escrito conforme acontece —
      // dá visibilidade do progresso e sobrevive a kill por timeout.
      outputFormat: "stream-json",
      verbose: true,
      logPath,
    });
  } catch (e) {
    if (e instanceof SessionLimitError) {
      throw new Error(`${e.message} — clique Aplicar de novo após o reset`);
    }
    if (e instanceof AuthError) {
      throw new Error(`${e.message} e clique Aplicar de novo (logs/pipeline-${jobId}.log)`);
    }
    throw e;
  }

  if (!run.ok) {
    throw new Error(`geração falhou (${run.erro}) — logs/pipeline-${jobId}.log`);
  }
}

function spawnSubmit(jobId: string): void {
  mkdirSync(join(PROJECT_ROOT, "logs"), { recursive: true });
  const log = openSync(join(PROJECT_ROOT, "logs", `submit-${jobId}.log`), "a");
  const child = spawn(process.execPath, [TSX_BIN, join(PROJECT_ROOT, "src", "cli", "submit.ts"), jobId], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ["ignore", log, log],
    env: process.env,
  });
  child.unref();
}

async function runPipeline(): Promise<void> {
  if (pipelineBusy) return;
  const jobId = pipelineQueue.shift();
  if (!jobId) return;
  pipelineBusy = true;
  const st = pipelineItems.get(jobId)!;
  try {
    st.stage = "gerando";
    await runClaudeGenerate(jobId);
    const app = getApplicationByJob(jobId);
    if (!app || app.status !== "kit_ready") {
      throw new Error(`kit não ficou pronto (status: ${app?.status ?? "sem application"}) — veja logs/pipeline-${jobId}.log`);
    }
    // só há submissão automatizada para estes ATSs; nos demais o kit fica pronto para aplicação manual
    const SUBMITTABLE = new Set(["greenhouse", "lever", "workday", "linkedin"]);
    const jobNow = getJob(jobId); // o /gerar pode ter resolvido a URL direta (job-url) e mudado o ats_platform
    if (jobNow && SUBMITTABLE.has(jobNow.ats_platform ?? "")) {
      spawnSubmit(jobId);
      st.stage = "no_chrome";
      st.detail = "kit gerado — o Chrome abre preenchido; revise e clique em enviar";
    } else {
      st.stage = "concluida";
      st.detail = `kit pronto em ${app.kit_dir?.split("/").pop() ?? "output/"} — plataforma "${jobNow?.ats_platform ?? "?"}" ainda sem submissão automática: aplique com o PDF do kit (link da vaga no funil)`;
    }
  } catch (err) {
    st.stage = "erro";
    st.detail = String(err instanceof Error ? err.message : err).slice(0, 400);
  }
  pipelineBusy = false;
  void runPipeline();
}

function doApply(jobId: string) {
  const job = getJob(jobId);
  if (!job) throw new Error("vaga não encontrada");
  const existing = pipelineItems.get(jobId);
  if (existing && !["concluida", "erro"].includes(existing.stage)) {
    return { ok: false, error: "vaga já está no pipeline" };
  }
  // Mesmo gate do `kit prepare` (exit 5), aplicado aqui para o operador não
  // descobrir no meio do pipeline, depois de o token já ter sido gasto.
  const bloqueio = blocksGeneration(job, resolveLocality(job.location));
  if (bloqueio) {
    return {
      ok: false,
      error: `${bloqueio}. Confirme a modalidade antes de gerar — a vaga tem o botão "modalidade" na fila, ou: modality set ${jobId} remote|hybrid|onsite`,
      needsModality: true,
    };
  }
  // Mesmo gate do `kit prepare` (exit 6): score abaixo do corte sem confirmação.
  const bloqueioScore = blocksGenerationByScore(loadConfig(), job);
  if (bloqueioScore) {
    return {
      ok: false,
      error: `${bloqueioScore}. Confirme que quer gerar mesmo assim — botão "score baixo" na fila, ou: score confirm ${jobId} --note "..."`,
      needsScoreConfirm: true,
    };
  }
  doFeedback(jobId, "aprovar");
  // a vaga some da fila via apiQueue (pipeline em memória + application após o finalize)
  pipelineItems.set(jobId, {
    jobId,
    title: job.title,
    company: job.company_name,
    stage: "aguardando",
    detail: null,
    startedAt: nowIso(),
  });
  pipelineQueue.push(jobId);
  void runPipeline();
  return { ok: true };
}

/**
 * Tira a vaga do funil. Dois motivos, e a diferença não é cosmética.
 *
 *  - `closed`: **o anúncio não existe mais.** É fato sobre o mundo. Além de sair
 *    do funil, a vaga vira `expired` em `jobs`, o que a remove da repontuação e
 *    impede que uma busca futura a traga de volta como se ainda estivesse aberta.
 *  - `mine`: **eu não vou aplicar.** É decisão dele. A vaga continua existindo e
 *    elegível; só a candidatura foi descartada.
 *
 * Nenhum dos dois apaga linha nem arquivo: o kit custou dinheiro real (mediana
 * medida de $1,96) e o card volta pelo "restaurar".
 */
function doDiscard(jobId: string, kind: "closed" | "mine", note?: string) {
  const job = getJob(jobId);
  if (!job) throw new Error("vaga não encontrada");
  const fechada = kind === "closed";
  const motivo = note || (fechada ? "anúncio não está mais no ar" : "descartado na UI");
  doStatus(jobId, "withdrawn", motivo);
  if (fechada) {
    setJobStatus(jobId, "expired");
    logJobEvent(jobId, "job_expired", { via: "ui", note: motivo });
  }
  return { ok: true, expired: fechada };
}

function apiPipeline() {
  return [...pipelineItems.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20);
}

function doStatus(jobId: string, status: ApplicationStatus, note?: string) {
  const job = getJob(jobId);
  if (!job) throw new Error("vaga não encontrada");
  let app = getApplicationByJob(jobId);
  if (!app) app = createApplication(jobId, job.track_hint, "", "manual");
  const extra: { appliedAt?: string; notes?: string } = { notes: note };
  if (status === "applied") {
    extra.appliedAt = nowIso();
    if (job.company_id) bumpCompanyStat(job.company_id, "applications_count");
  } else if (status === "screening" && job.company_id) {
    bumpCompanyStat(job.company_id, "responses_count");
  } else if (status === "interview" && job.company_id) {
    bumpCompanyStat(job.company_id, "responses_count");
    bumpCompanyStat(job.company_id, "interviews_count");
  }
  setApplicationStatus(app.id, status, extra);
  return { ok: true };
}

function apiConfig() {
  const c = loadConfig();
  return {
    auto_search: c.auto_search,
    auto_search_hour: c.auto_search_hour,
    auto_search_days: c.auto_search_days,
    searches: c.searches,
    filters: c.filters,
    policy: {
      generate_min_score: c.policy.generate_min_score,
      full_auto_min_score: c.policy.full_auto_min_score,
    },
    submission: {
      default_mode: c.submission.default_mode,
      i_accept_ban_risk: c.submission.i_accept_ban_risk,
    },
  };
}

const ConfigPatch = z.object({
  auto_search: z.boolean(),
  auto_search_hour: z.number().int().min(0).max(23),
  auto_search_days: z.array(z.number().int().min(0).max(6)),
  searches: z.array(SearchSpec),
  filters: z.object({
    exclude_seniority: z.array(z.string()),
    max_years_required: z.number().int().min(0).max(30).nullable(),
    exclude_title_keywords: z.array(z.string()).default([]),
  }),
  policy: z.object({
    generate_min_score: z.number().min(0).max(100),
    full_auto_min_score: z.number().min(0).max(100),
  }),
  submission: z.object({
    default_mode: z.enum(["review_first", "approve_batch", "full_auto"]),
  }),
});

function doConfigSave(body: unknown) {
  const p = ConfigPatch.parse(body);
  // parseDocument preserva os comentários do config.yaml fora das chaves editadas
  const doc = parseDocument(readFileSync(CONFIG_PATH, "utf-8"));
  doc.set("auto_search", p.auto_search ? "on" : "off");
  doc.set("auto_search_hour", p.auto_search_hour);
  doc.set("auto_search_days", p.auto_search_days);
  doc.set(
    "searches",
    p.searches
      .filter((s) => s.query.trim().length > 0)
      .map((s) => ({
        query: s.query.trim(),
        sources: s.sources,
        ...(s.location ? { location: s.location } : {}),
        remote_only: s.remote_only,
      }))
  );
  doc.setIn(["filters", "exclude_seniority"], p.filters.exclude_seniority);
  doc.setIn(["filters", "max_years_required"], p.filters.max_years_required);
  doc.setIn(["filters", "exclude_title_keywords"], p.filters.exclude_title_keywords);
  doc.setIn(["policy", "generate_min_score"], p.policy.generate_min_score);
  doc.setIn(["policy", "full_auto_min_score"], p.policy.full_auto_min_score);
  doc.setIn(["submission", "default_mode"], p.submission.default_mode);
  writeFileSync(CONFIG_PATH, doc.toString(), "utf-8");

  const config = loadConfig(); // revalida o YAML gravado
  applySchedule(config);
  return {
    ok: true,
    schedule: config.auto_search ? `busca automática: ${describeSchedule(config)}` : "busca automática desligada",
    searches: config.searches.length,
  };
}

async function doSearch(query?: string) {
  if (searchState.running) return { ok: false, error: "busca já em andamento" };
  searchState = { running: true, startedAt: nowIso(), lastResult: null };
  (async () => {
    try {
      const config = loadConfig();
      decayPreferenceWeights(config);
      const specs = query
        ? [{ query, sources: ["remotive", "remoteok", "wwr", "gupy", "linkedin"], location: undefined as string | undefined, remote_only: false }]
        : config.searches.filter((s) => s.query.trim().length > 0);
      let summary: string[] = [];
      for (const spec of specs) {
        const result = await runSearch(resolveAdapters(spec.sources), { query: spec.query, location: spec.location }, "manual");
        const scored = scoreNewJobs(config, result.newJobIds);
        summary.push(`"${spec.query}": ${result.newJobIds.length} novas, ${scored.filter((s) => s.status === "queued").length} na fila`);
      }
      searchState = { running: false, startedAt: searchState.startedAt, lastResult: summary.join(" · ") || "nenhuma busca configurada" };
    } catch (err) {
      searchState = { running: false, startedAt: searchState.startedAt, lastResult: `erro: ${String(err)}` };
    }
  })();
  return { ok: true };
}

/**
 * Monta o servidor (rotas + WS do terminal) SEM escutar porta nenhuma — é o que
 * permite um teste subir isto numa porta efêmera (`server.listen(0)`), em vez de
 * depender do processo real na 4780. `.listen()` e o `execFileSync("open", ...)`
 * continuam fora daqui, só no bloco de entrypoint no fim do arquivo — importar
 * este módulo nunca deve abrir porta nem aba de browser sozinho.
 */
export function createApp() {
  const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(APP_HTML, "utf-8").replaceAll("__WS_TOKEN__", SESSION_TOKEN));
    } else if (req.method === "GET" && url.pathname === "/dashboard") {
      buildDashboard();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(DASHBOARD_PATH, "utf-8"));
    } else if (req.method === "GET" && url.pathname === "/api/summary") {
      json(res, 200, apiSummary());
    } else if (req.method === "GET" && url.pathname === "/api/queue") {
      json(res, 200, apiQueue(parseInt(url.searchParams.get("limit") ?? "50", 10), url.searchParams.get("track")));
    } else if (req.method === "GET" && url.pathname === "/api/applications") {
      json(res, 200, apiApplications());
    } else if (req.method === "GET" && url.pathname === "/api/companies") {
      json(res, 200, apiCompanies());
    } else if (req.method === "GET" && url.pathname.startsWith("/api/snapshot/")) {
      const job = getJob(url.pathname.split("/").pop()!);
      if (job?.jd_snapshot_path && existsSync(job.jd_snapshot_path)) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(readFileSync(job.jd_snapshot_path, "utf-8"));
      } else {
        json(res, 404, { error: "sem snapshot" });
      }
    } else if (req.method === "POST" && url.pathname === "/api/feedback") {
      const { jobId, verdict, reason, reasonClass } = await readBody(req);
      json(res, 200, doFeedback(jobId, verdict, reason, reasonClass));
    } else if (req.method === "POST" && url.pathname === "/api/status") {
      const { jobId, status, note } = await readBody(req);
      json(res, 200, doStatus(jobId, status, note));
    } else if (req.method === "GET" && url.pathname === "/api/pipeline") {
      json(res, 200, apiPipeline());
    } else if (req.method === "GET" && url.pathname === "/api/rejected") {
      json(res, 200, apiRejected(parseInt(url.searchParams.get("limit") ?? "40", 10)));
    } else if (req.method === "POST" && url.pathname === "/api/apply") {
      const { jobId } = await readBody(req);
      json(res, 200, doApply(jobId));
    } else if (req.method === "POST" && url.pathname === "/api/job-url") {
      const { url: alvo, title, company } = await readBody(req);
      const r = await addJobByUrl(loadConfig(), String(alvo ?? ""), { title, companyName: company });
      json(res, r.ok ? 200 : 400, r);
    } else if (req.method === "POST" && url.pathname === "/api/discard") {
      const { jobId, kind, note } = await readBody(req);
      json(res, 200, doDiscard(jobId, kind, note));
    } else if (req.method === "POST" && url.pathname === "/api/modality") {
      const { jobId, state, note } = await readBody(req);
      const s = parseModalityState(state);
      if (!s) { json(res, 400, { error: "estado inválido — use remote, hybrid ou onsite" }); return; }
      confirmModality(jobId, s, note ?? null);
      json(res, 200, { ok: true, state: s });
    } else if (req.method === "POST" && url.pathname === "/api/score-confirm") {
      const { jobId, note } = await readBody(req);
      confirmScore(jobId, true, note ?? null);
      json(res, 200, { ok: true });
    } else if (req.method === "POST" && url.pathname === "/api/revert") {
      const { jobId } = await readBody(req);
      json(res, 200, doRevert(jobId));
    } else if (req.method === "GET" && url.pathname === "/api/config") {
      json(res, 200, apiConfig());
    } else if (req.method === "POST" && url.pathname === "/api/config") {
      json(res, 200, doConfigSave(await readBody(req)));
    } else if (req.method === "POST" && url.pathname === "/api/search") {
      const { query } = await readBody(req);
      json(res, 200, await doSearch(query));
    } else if (req.method === "GET" && url.pathname === "/api/tracks") {
      json(res, 200, listTracks());
    } else if (req.method === "POST" && url.pathname === "/api/tracks") {
      const { id, name, summary, keywords } = await readBody(req);
      try {
        json(res, 200, createTrack({ id, name, summary: summary ?? null, keywords: keywords ?? [] }));
      } catch (e) {
        json(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
    } else if (req.method === "PUT" && url.pathname.startsWith("/api/tracks/")) {
      const id = url.pathname.split("/").pop()!;
      const { name, summary, keywords, enabled } = await readBody(req);
      try {
        json(res, 200, updateTrack(id, { name, summary, keywords, enabled }));
      } catch (e) {
        json(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
    } else {
      json(res, 404, { error: "rota desconhecida" });
    }
  } catch (err) {
    json(res, 500, { error: String(err) });
  }
});

// Terminal embedado (aba Claude): PTY real rodando zsh no diretório do projeto.
// O `claude` CLI dentro dele usa a assinatura logada — zero custo de API.
//
// Bind em 127.0.0.1 não basta: conexões WebSocket não passam pela política de
// mesma origem, então o upgrade exige Origin na allowlist E token de sessão.
// A verificação vem antes do spawn — conexão recusada não cria PTY nenhum.
const wss = new WebSocketServer({ server, path: "/term" });
wss.on("connection", (ws, req) => {
  const verdict = isAuthorizedUpgrade(req, SESSION_TOKEN, PORT);
  if (!verdict.ok) {
    ws.close(verdict.code, verdict.reason);
    return;
  }
  const shell = pty.spawn(process.env.SHELL ?? "/bin/zsh", ["-l"], {
    name: "xterm-256color",
    cols: 120,
    rows: 32,
    cwd: PROJECT_ROOT,
    env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
  });
  shell.onData((d) => ws.readyState === ws.OPEN && ws.send(d));
  shell.onExit(() => ws.close());
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.t === "i") shell.write(msg.d);
      else if (msg.t === "r") shell.resize(msg.cols, msg.rows);
    } catch {
      /* mensagem inválida — ignora */
    }
  });
  ws.on("close", () => shell.kill());
});

  return server;
}

// Só sobe de verdade quando este arquivo é o processo principal — importar o
// módulo (ex.: de um teste, via createApp()) nunca deve escutar porta nem abrir
// browser. `npx tsx src/server/index.ts` e o binário do serviço (ui-service.ts →
// launchd) passam por aqui; um `import { createApp } from "./index.js"` não.
const isMainModule = !!process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const server = createApp();
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Curriculos UI: http://localhost:${PORT}`);
    // como serviço (launchd) não abre o browser — senão surge uma aba a cada login/restart
    if (!process.env.CURRICULOS_SERVICE) {
      try {
        execFileSync("open", [`http://localhost:${PORT}`]);
      } catch {
        /* abrir manualmente */
      }
    }
  });
}
