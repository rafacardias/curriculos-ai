/**
 * answers — gerencia o answer bank (perguntas de triagem reutilizáveis).
 *
 *   npx tsx src/cli/answers.ts list [--lang pt]
 *   npx tsx src/cli/answers.ts add "<pergunta>" "<resposta>" [--lang pt] [--track id] [--company nome]
 *   npx tsx src/cli/answers.ts find "<pergunta>"
 *   npx tsx src/cli/answers.ts pending          # submissões pausadas aguardando resposta
 */
import { parseArgs } from "node:util";
import { ulid } from "ulid";
import { getDb, nowIso } from "../db/client.js";
import { normalize } from "../core/dedup.js";
import { getCompanyByName } from "../db/repo/companies.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    lang: { type: "string", default: "pt" },
    track: { type: "string" },
    company: { type: "string" },
  },
});

const [cmd, ...args] = positionals;
const db = getDb();

if (cmd === "list") {
  const rows = db
    .prepare("SELECT question_text, answer, language, track_id, times_used FROM answer_bank ORDER BY times_used DESC")
    .all() as unknown as Array<{ question_text: string; answer: string; language: string; track_id: string | null; times_used: number }>;
  if (!rows.length) console.log("answer bank vazio.");
  for (const r of rows) {
    console.log(`[${r.language}${r.track_id ? `/${r.track_id}` : ""}] (${r.times_used}x) ${r.question_text}`);
    console.log(`    → ${r.answer}`);
  }
} else if (cmd === "add") {
  const [question, answer] = args;
  if (!question || !answer) {
    console.error('uso: answers add "<pergunta>" "<resposta>"');
    process.exit(1);
  }
  const companyId = values.company ? (getCompanyByName(values.company)?.id ?? null) : null;
  const fp = normalize(question);
  const existing = db
    .prepare("SELECT id FROM answer_bank WHERE question_fingerprint = ? AND language = ? AND track_id IS ? AND company_id IS ?")
    .get(fp, values.lang, values.track ?? null, companyId) as { id: string } | undefined;
  if (existing) {
    db.prepare("UPDATE answer_bank SET answer = ?, updated_at = ? WHERE id = ?").run(answer, nowIso(), existing.id);
    console.log("resposta atualizada.");
  } else {
    db.prepare(
      `INSERT INTO answer_bank (id, question_fingerprint, question_text, answer, language, track_id, company_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(ulid(), fp, question, answer, values.lang, values.track ?? null, companyId, nowIso(), nowIso());
    console.log("resposta adicionada ao answer bank.");
  }
} else if (cmd === "find") {
  const [question] = args;
  if (!question) {
    console.error('uso: answers find "<pergunta>"');
    process.exit(1);
  }
  const fp = normalize(question);
  const row = db
    .prepare("SELECT answer, times_used FROM answer_bank WHERE question_fingerprint = ? ORDER BY times_used DESC LIMIT 1")
    .get(fp) as { answer: string } | undefined;
  console.log(row ? row.answer : "(sem resposta salva)");
} else if (cmd === "pending") {
  const rows = db
    .prepare(
      `SELECT s.id, s.pending_question, j.title, j.company_name
       FROM submissions s
       JOIN applications a ON a.id = s.application_id
       JOIN jobs j ON j.id = a.job_id
       WHERE s.status = 'awaiting_user'`
    )
    .all() as unknown as Array<{ id: string; pending_question: string | null; title: string; company_name: string }>;
  if (!rows.length) console.log("nenhuma submissão aguardando resposta.");
  for (const r of rows) {
    console.log(`[${r.id}] ${r.title} @ ${r.company_name}`);
    console.log(`    pergunta: ${r.pending_question ?? "?"}`);
  }
} else {
  console.error("uso: answers list|add|find|pending");
  process.exit(1);
}
