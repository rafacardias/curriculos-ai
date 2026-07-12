/**
 * company — company memory: histórico, taxas e notas por empresa.
 *
 *   npx tsx src/cli/company.ts show "<nome>"
 *   npx tsx src/cli/company.ts note "<nome>" "<nota>"
 *   npx tsx src/cli/company.ts top          # empresas com melhor taxa de resposta
 */
import { getDb, nowIso } from "../db/client.js";
import { getCompanyByName } from "../db/repo/companies.js";

const [cmd, name, note] = process.argv.slice(2);
const db = getDb();

if (cmd === "show" && name) {
  const c = getCompanyByName(name);
  if (!c) {
    console.log(`empresa não encontrada: ${name}`);
    process.exit(0);
  }
  console.log(`${c.name}  (${c.domain ?? "sem domínio"})`);
  console.log(
    `aplicações: ${c.applications_count} · respostas: ${c.responses_count} · entrevistas: ${c.interviews_count}`
  );
  if (c.notes) console.log(`notas: ${c.notes}`);
  const jobs = db
    .prepare(
      `SELECT j.title, a.status, a.applied_at FROM applications a
       JOIN jobs j ON j.id = a.job_id WHERE j.company_id = ? ORDER BY a.created_at DESC`
    )
    .all(c.id) as unknown as Array<{ title: string; status: string; applied_at: string | null }>;
  for (const j of jobs) {
    console.log(`  - ${j.title} · ${j.status}${j.applied_at ? ` · aplicado ${j.applied_at.slice(0, 10)}` : ""}`);
  }
  const answers = db
    .prepare("SELECT question_text, answer FROM answer_bank WHERE company_id = ?")
    .all(c.id) as unknown as Array<{ question_text: string; answer: string }>;
  if (answers.length) {
    console.log("respostas específicas desta empresa:");
    for (const a of answers) console.log(`  Q: ${a.question_text}\n  A: ${a.answer}`);
  }
} else if (cmd === "note" && name && note) {
  const c = getCompanyByName(name);
  if (!c) {
    console.error(`empresa não encontrada: ${name}`);
    process.exit(1);
  }
  const merged = c.notes ? `${c.notes}\n${note}` : note;
  db.prepare("UPDATE companies SET notes = ?, updated_at = ? WHERE id = ?").run(merged, nowIso(), c.id);
  console.log("nota adicionada.");
} else if (cmd === "top") {
  const rows = db
    .prepare(
      `SELECT name, applications_count, responses_count, interviews_count
       FROM companies WHERE applications_count > 0
       ORDER BY CAST(responses_count AS REAL) / applications_count DESC LIMIT 15`
    )
    .all() as unknown as Array<{ name: string; applications_count: number; responses_count: number; interviews_count: number }>;
  if (!rows.length) console.log("nenhuma empresa com aplicações ainda.");
  for (const r of rows) {
    const rate = Math.round((r.responses_count / r.applications_count) * 100);
    console.log(`${r.name}: ${r.applications_count} apps · ${rate}% resposta · ${r.interviews_count} entrevistas`);
  }
} else {
  console.error('uso: company show|note|top "<nome>" ["nota"]');
  process.exit(1);
}
