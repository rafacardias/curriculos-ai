import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDb, PROJECT_ROOT } from "../db/client.js";

export const DASHBOARD_PATH = join(PROJECT_ROOT, "dashboard", "index.html");

interface Row {
  [k: string]: string | number | null;
}

/**
 * Gera o dashboard estático (funil + performance warehouse).
 * Single-hue sequential para magnitudes; identidade por texto, nunca só por cor.
 */
export function buildDashboard(): string {
  const db = getDb();
  const q = (sql: string) => db.prepare(sql).all() as unknown as Row[];
  const one = (sql: string) => (db.prepare(sql).get() as Row | undefined) ?? {};

  const totals = one(`SELECT
    (SELECT COUNT(*) FROM jobs) AS jobs,
    (SELECT COUNT(*) FROM jobs WHERE status='queued') AS queued,
    (SELECT COUNT(*) FROM applications WHERE status='kit_ready') AS kit_ready,
    (SELECT COUNT(*) FROM applications WHERE status='applied') AS applied,
    (SELECT COUNT(*) FROM applications WHERE status IN ('screening','interview','offer')) AS responded,
    (SELECT COUNT(*) FROM applications WHERE status='interview') AS interviews,
    (SELECT COUNT(*) FROM applications WHERE status='offer') AS offers`);

  const funnel: Array<[string, number]> = [
    ["Na fila", Number(totals.queued ?? 0)],
    ["Kit pronto", Number(totals.kit_ready ?? 0)],
    ["Aplicadas", Number(totals.applied ?? 0)],
    ["Com resposta", Number(totals.responded ?? 0)],
    ["Entrevistas", Number(totals.interviews ?? 0)],
    ["Ofertas", Number(totals.offers ?? 0)],
  ];

  const bySource = q(`SELECT j.source AS seg, COUNT(a.id) AS apps,
      SUM(CASE WHEN a.status IN ('screening','interview','offer') THEN 1 ELSE 0 END) AS resp,
      SUM(CASE WHEN a.status IN ('interview','offer') THEN 1 ELSE 0 END) AS interviews
    FROM applications a JOIN jobs j ON j.id=a.job_id
    WHERE a.status != 'kit_ready' GROUP BY j.source ORDER BY apps DESC`);

  const byTrack = q(`SELECT COALESCE(a.track_id,'?') AS seg, COUNT(a.id) AS apps,
      SUM(CASE WHEN a.status IN ('screening','interview','offer') THEN 1 ELSE 0 END) AS resp,
      SUM(CASE WHEN a.status IN ('interview','offer') THEN 1 ELSE 0 END) AS interviews
    FROM applications a WHERE a.status != 'kit_ready' GROUP BY a.track_id ORDER BY apps DESC`);

  const byMode = q(`SELECT COALESCE(a.submission_mode,'manual') AS seg, COUNT(a.id) AS apps,
      SUM(CASE WHEN a.status IN ('screening','interview','offer') THEN 1 ELSE 0 END) AS resp,
      SUM(CASE WHEN a.status IN ('interview','offer') THEN 1 ELSE 0 END) AS interviews
    FROM applications a WHERE a.status != 'kit_ready' GROUP BY a.submission_mode ORDER BY apps DESC`);

  const byCoverage = q(`SELECT
      CASE WHEN json_extract(rv.keyword_report,'$.coveragePct') >= 70 THEN '70-100%'
           WHEN json_extract(rv.keyword_report,'$.coveragePct') >= 40 THEN '40-69%'
           ELSE '0-39%' END AS seg,
      COUNT(DISTINCT a.id) AS apps,
      SUM(CASE WHEN a.status IN ('screening','interview','offer') THEN 1 ELSE 0 END) AS resp,
      SUM(CASE WHEN a.status IN ('interview','offer') THEN 1 ELSE 0 END) AS interviews
    FROM applications a JOIN resume_versions rv ON rv.application_id=a.id
    WHERE a.status != 'kit_ready' GROUP BY seg ORDER BY seg DESC`);

  const byVariant = q(`SELECT COALESCE(json_extract(rv.variant,'$.id'),'—') AS seg,
      COUNT(DISTINCT a.id) AS apps,
      SUM(CASE WHEN a.status IN ('screening','interview','offer') THEN 1 ELSE 0 END) AS resp,
      SUM(CASE WHEN a.status IN ('interview','offer') THEN 1 ELSE 0 END) AS interviews
    FROM applications a JOIN resume_versions rv ON rv.application_id=a.id
    WHERE a.status != 'kit_ready' GROUP BY seg ORDER BY apps DESC`);

  const weekly = q(`SELECT strftime('%Y-W%W', applied_at) AS seg, COUNT(*) AS apps
    FROM applications WHERE applied_at IS NOT NULL GROUP BY seg ORDER BY seg DESC LIMIT 8`);

  const topCompanies = q(`SELECT name AS seg, applications_count AS apps, responses_count AS resp,
      interviews_count AS interviews
    FROM companies WHERE applications_count > 0
    ORDER BY CAST(responses_count AS REAL)/applications_count DESC LIMIT 10`);

  const maxFunnel = Math.max(1, ...funnel.map(([, v]) => v));

  const bar = (v: number, max: number) =>
    `<div class="bar"><div class="fill" style="width:${Math.max(2, Math.round((v / Math.max(1, max)) * 100))}%"></div></div>`;

  const rateTable = (title: string, rows: Row[], note?: string) => {
    if (!rows.length)
      return `<section><h2>${title}</h2><p class="muted">Sem dados ainda.</p></section>`;
    const body = rows
      .map((r) => {
        const apps = Number(r.apps ?? 0);
        const resp = Number(r.resp ?? 0);
        const inter = Number(r.interviews ?? 0);
        const respRate = apps ? Math.round((resp / apps) * 100) : 0;
        const interRate = apps ? Math.round((inter / apps) * 100) : 0;
        return `<tr><th scope="row">${r.seg}</th><td>${apps}</td><td>${resp} (${respRate}%)</td><td>${inter} (${interRate}%)</td></tr>`;
      })
      .join("\n");
    return `<section><h2>${title}</h2>${note ? `<p class="muted">${note}</p>` : ""}
<table><thead><tr><th>Segmento</th><th>Aplicações</th><th>Respostas</th><th>Entrevistas</th></tr></thead>
<tbody>${body}</tbody></table></section>`;
  };

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Curriculos — Painel</title>
<style>
  :root {
    --ink: #1a1d24; --ink-2: #5c6270; --surface: #ffffff; --surface-2: #f2f4f8;
    --line: #d9dde5; --accent: #3555c8; --accent-soft: #e3e9fb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #e8eaf0; --ink-2: #9aa1b0; --surface: #14161c; --surface-2: #1e2129;
      --line: #333845; --accent: #7d97f0; --accent-soft: #26304d;
    }
  }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", sans-serif; color: var(--ink);
         background: var(--surface); margin: 0; padding: 32px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 0 0 8px; }
  .muted { color: var(--ink-2); font-size: 13px; margin: 2px 0 10px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin: 20px 0 28px; }
  .tile { background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
  .tile .n { font-size: 26px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .tile .l { font-size: 12px; color: var(--ink-2); }
  section { background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px;
            padding: 18px 20px; margin-bottom: 16px; overflow-x: auto; }
  .funnel-row { display: grid; grid-template-columns: 110px 1fr 48px; align-items: center;
                gap: 10px; margin: 6px 0; font-size: 13px; }
  .funnel-row .v { text-align: right; font-variant-numeric: tabular-nums; }
  .bar { background: transparent; height: 14px; }
  .fill { background: var(--accent); height: 100%; border-radius: 0 4px 4px 0; min-width: 2px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line);
           font-variant-numeric: tabular-nums; }
  thead th { color: var(--ink-2); font-weight: 500; font-size: 12px; }
  footer { color: var(--ink-2); font-size: 12px; margin-top: 20px; }
</style>
</head>
<body>
<h1>Curriculos — Painel</h1>
<p class="muted">Gerado em ${new Date().toLocaleString("pt-BR")} · ${totals.jobs} vagas vistas no total</p>

<div class="tiles">
  ${funnel.map(([l, v]) => `<div class="tile"><div class="n">${v}</div><div class="l">${l}</div></div>`).join("\n  ")}
</div>

<section>
  <h2>Funil</h2>
  ${funnel
    .map(
      ([l, v]) =>
        `<div class="funnel-row"><span>${l}</span>${bar(v, maxFunnel)}<span class="v">${v}</span></div>`
    )
    .join("\n  ")}
</section>

${rateTable("Por fonte", bySource)}
${rateTable("Por trilha", byTrack)}
${rateTable("Por modo de submissão", byMode, "review_first × approve_batch × full_auto — convertem diferente?")}
${rateTable("Por faixa de cobertura de keywords", byCoverage, "Cobertura do coverage report na versão do currículo enviada.")}
${rateTable("Por variante de currículo (experimento)", byVariant, "A = metric-first · B = role-first. Sinal direcional — não é teste estatístico com n pequeno.")}
${rateTable("Empresas com melhor taxa de resposta", topCompanies)}

<section>
  <h2>Volume semanal de aplicações</h2>
  ${
    weekly.length
      ? `<table><thead><tr><th>Semana</th><th>Aplicações</th></tr></thead><tbody>${weekly
          .map((r) => `<tr><th scope="row">${r.seg}</th><td>${r.apps}</td></tr>`)
          .join("")}</tbody></table>`
      : `<p class="muted">Sem aplicações ainda.</p>`
  }
</section>

<footer>Taxas com n pequeno são sinal direcional, não conclusão estatística. "ATS score" nos kits é estimativa heurística.</footer>
</body>
</html>`;

  mkdirSync(join(PROJECT_ROOT, "dashboard"), { recursive: true });
  writeFileSync(DASHBOARD_PATH, html, "utf-8");
  return DASHBOARD_PATH;
}
