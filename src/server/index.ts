/**
 * Servidor local do Curriculos — UI web em http://localhost:4780
 *
 *   npm run ui
 *
 * Reusa o core diretamente (mesmo processo). Ações de julgamento (gerar kit,
 * redigir) continuam no Claude Code — a UI cobre operação e visibilidade.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { WebSocketServer } from "ws";
import pty from "node-pty";
import { parseDocument } from "yaml";
import { z } from "zod";
import { getDb, nowIso, PROJECT_ROOT } from "../db/client.js";
import { loadConfig, CONFIG_PATH, SearchSpec } from "../core/config.js";
import { applySchedule, describeSchedule } from "../local/schedule-ctl.js";
import { runSearch } from "../core/pipeline.js";
import { resolveAdapters } from "../adapters/index.js";
import { scoreNewJobs, decayPreferenceWeights } from "../core/scoring.js";
import { buildDashboard, DASHBOARD_PATH } from "../dashboard/build.js";
import { setJobStatus, getJob } from "../db/repo/jobs.js";
import { getApplicationByJob, createApplication, setApplicationStatus } from "../db/repo/applications.js";
import { bumpCompanyStat } from "../db/repo/companies.js";
import { ulid } from "ulid";
import { termsPresent } from "../core/keywords.js";
import type { ApplicationStatus } from "../core/types.js";

const PORT = 4780;
const APP_HTML = join(PROJECT_ROOT, "src", "server", "app.html");

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
  return {
    queued: one("SELECT COUNT(*) AS n FROM jobs WHERE status='queued'"),
    kits: one("SELECT COUNT(*) AS n FROM applications WHERE status='kit_ready'"),
    awaiting: one("SELECT COUNT(*) AS n FROM submissions WHERE status='awaiting_user'"),
    applied: one("SELECT COUNT(*) AS n FROM applications WHERE status NOT IN ('kit_ready','submitting')"),
    interviews: one("SELECT COUNT(*) AS n FROM applications WHERE status IN ('interview','offer')"),
    lastRun: lastRun
      ? { at: lastRun.started_at, mode: lastRun.mode, perSource: lastRun.per_source ? JSON.parse(lastRun.per_source) : null }
      : null,
    searchRunning: searchState.running,
  };
}

function apiQueue(limit: number) {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT id, title, company_name, url, source, ats_platform, location, remote_type,
                language, seniority, score, score_detail, track_hint, policy_action, posted_at
         FROM jobs WHERE status='queued' ORDER BY score DESC LIMIT ?`
      )
      .all(limit) as any[]
  ).map((j) => ({ ...j, score_detail: j.score_detail ? JSON.parse(j.score_detail) : null }));
}

function apiApplications() {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.id, a.job_id, a.status, a.applied_at, a.kit_dir, a.submission_mode, a.track_id, a.notes,
              j.title, j.company_name, j.url, j.source, j.ats_platform
       FROM applications a JOIN jobs j ON j.id = a.job_id
       ORDER BY a.updated_at DESC`
    )
    .all() as any[];
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

function doFeedback(jobId: string, verdict: "aprovar" | "rejeitar", reason?: string) {
  const db = getDb();
  const job = getJob(jobId);
  if (!job) throw new Error("vaga não encontrada");
  const config = loadConfig();
  const approve = verdict === "aprovar";
  const delta = approve ? 1 : -1;
  const cap = config.preferences.max_weight;
  const keys: string[] = [`company:${job.company_name.toLowerCase()}`, `source:${job.source}`];
  if (job.seniority) keys.push(`seniority:${job.seniority}`);
  const tracks = db.prepare("SELECT keywords FROM profile_tracks").all() as unknown as Array<{ keywords: string }>;
  const lexicon = tracks.flatMap((t) => JSON.parse(t.keywords) as string[]);
  for (const kw of termsPresent(`${job.title} ${job.description ?? ""}`, lexicon).slice(0, 8)) {
    keys.push(`kw:${kw.toLowerCase()}`);
  }
  const upsert = db.prepare(
    `INSERT INTO preference_weights (key, weight, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       weight = MAX(${-cap}, MIN(${cap}, preference_weights.weight + excluded.weight)),
       updated_at = excluded.updated_at`
  );
  for (const key of keys) upsert.run(key, delta, nowIso());
  db.prepare(
    "INSERT INTO events (id, entity, entity_id, type, payload, created_at) VALUES (?, 'job', ?, ?, ?, ?)"
  ).run(ulid(), jobId, approve ? "feedback_approve" : "feedback_reject", JSON.stringify({ reason: reason ?? null, via: "ui" }), nowIso());
  if (!approve) setJobStatus(jobId, "rejected");
  return { ok: true, keys };
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(APP_HTML, "utf-8"));
    } else if (req.method === "GET" && url.pathname === "/dashboard") {
      buildDashboard();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(DASHBOARD_PATH, "utf-8"));
    } else if (req.method === "GET" && url.pathname === "/api/summary") {
      json(res, 200, apiSummary());
    } else if (req.method === "GET" && url.pathname === "/api/queue") {
      json(res, 200, apiQueue(parseInt(url.searchParams.get("limit") ?? "50", 10)));
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
      const { jobId, verdict, reason } = await readBody(req);
      json(res, 200, doFeedback(jobId, verdict, reason));
    } else if (req.method === "POST" && url.pathname === "/api/status") {
      const { jobId, status, note } = await readBody(req);
      json(res, 200, doStatus(jobId, status, note));
    } else if (req.method === "GET" && url.pathname === "/api/config") {
      json(res, 200, apiConfig());
    } else if (req.method === "POST" && url.pathname === "/api/config") {
      json(res, 200, doConfigSave(await readBody(req)));
    } else if (req.method === "POST" && url.pathname === "/api/search") {
      const { query } = await readBody(req);
      json(res, 200, await doSearch(query));
    } else {
      json(res, 404, { error: "rota desconhecida" });
    }
  } catch (err) {
    json(res, 500, { error: String(err) });
  }
});

// Terminal embedado (aba Claude): PTY real rodando zsh no diretório do projeto.
// O `claude` CLI dentro dele usa a assinatura logada — zero custo de API.
// Bind exclusivo em 127.0.0.1: nunca expor um terminal na rede.
const wss = new WebSocketServer({ server, path: "/term" });
wss.on("connection", (ws) => {
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Curriculos UI: http://localhost:${PORT}`);
  try {
    execFileSync("open", [`http://localhost:${PORT}`]);
  } catch {
    /* abrir manualmente */
  }
});
