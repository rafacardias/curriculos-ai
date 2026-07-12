import { getDb, nowIso } from "../db/client.js";
import { normalize } from "../core/dedup.js";
import type { MasterProfile } from "../core/types.js";

export interface ResolvedField {
  value: string;
  source: "identity" | "candidate_fact" | "answer_bank";
}

/** Padrões de label → chave canônica de candidate_facts ou campo de identidade. */
const IDENTITY_PATTERNS: Array<[RegExp, (p: MasterProfile) => string | undefined]> = [
  [/first\s*name|^nome$|primeiro nome/i, (p) => p.identity.name.split(" ")[0]],
  [/last\s*name|sobrenome|surname|family name/i, (p) => p.identity.name.split(" ").slice(1).join(" ")],
  [/full\s*name|nome completo|^name$/i, (p) => p.identity.name],
  [/e-?mail/i, (p) => p.identity.email],
  [/phone|telefone|celular|mobile/i, (p) => p.identity.phone],
  [/linkedin/i, (p) => p.identity.linkedin],
  [/github|portfolio|website|site pessoal/i, (p) => p.identity.github],
  // só labels curtos: perguntas longas contendo "location" são de triagem, não identidade
  [/^(location|cidade|city|current location|localiza[çc][ãa]o)$/i, (p) => p.identity.location],
];

const FACT_PATTERNS: Array<[RegExp, string]> = [
  [/work authorization|autorizad[oa].*trabalh|legally authorized|right to work/i, "work_authorization"],
  [/salary|pretens[ãa]o|remunera[çc][ãa]o|compensation expectation/i, "salary_expectation"],
  [/sponsor|sponsorship|visto/i, "visa_sponsorship_needed"],
  [/notice period|aviso pr[ée]vio|quando pode come[çc]ar|start date|disponibilidade/i, "notice_period"],
  [/relocat|mudan[çc]a|remote|presencial|h[íi]brido|flexib/i, "location_flexibility"],
  [/pronoun|pronome/i, "pronouns"],
  [/disabilit|defici[êe]ncia|pcd/i, "disability"],
  [/veteran/i, "veteran_status"],
];

/**
 * Cascata de preenchimento: identidade → candidate_facts → answer_bank.
 * Retorna null quando não há resposta conhecida (a submissão pausa, nunca chuta).
 */
export function resolveField(
  label: string,
  profile: MasterProfile,
  language: "pt" | "en"
): ResolvedField | null {
  const db = getDb();

  // candidate_facts têm precedência: perguntas de triagem podem conter termos
  // que também casariam com padrões de identidade (ex.: "...current location?")
  const factMatch = matchFacts(label, language, db);
  if (factMatch !== undefined) return factMatch;

  for (const [re, getter] of IDENTITY_PATTERNS) {
    if (re.test(label)) {
      const v = getter(profile);
      if (v) return { value: v, source: "identity" };
    }
  }

  const fp = normalize(label);
  const answer = db
    .prepare(
      "SELECT id, answer FROM answer_bank WHERE question_fingerprint = ? AND language IN (?, 'pt', 'en') ORDER BY times_used DESC LIMIT 1"
    )
    .get(fp, language) as { id: string; answer: string } | undefined;
  if (answer) {
    db.prepare("UPDATE answer_bank SET times_used = times_used + 1, updated_at = ? WHERE id = ?").run(
      nowIso(),
      answer.id
    );
    return { value: answer.answer, source: "answer_bank" };
  }

  return null;
}

/** undefined = nenhum padrão de fact casou; null = casou mas não há fato salvo (pausar). */
function matchFacts(
  label: string,
  language: "pt" | "en",
  db: ReturnType<typeof getDb>
): ResolvedField | null | undefined {
  for (const [re, key] of FACT_PATTERNS) {
    if (!re.test(label)) continue;
    // salary tem variação por moeda — tenta específica do idioma primeiro
    const keys =
      key === "salary_expectation"
        ? language === "pt"
          ? ["salary_expectation_brl", "salary_expectation_usd"]
          : ["salary_expectation_usd", "salary_expectation_brl"]
        : [key];
    for (const k of keys) {
      const row = db
        .prepare("SELECT value FROM candidate_facts WHERE key = ? AND language IN (?, 'pt', 'en') LIMIT 1")
        .get(k, language) as { value: string } | undefined;
      if (row) return { value: row.value, source: "candidate_fact" };
    }
  }
  // sem fato salvo (mesmo se um padrão casou): segue a cascata — o answer_bank
  // ainda pode ter resposta salva por texto; se tudo falhar, resolveField
  // retorna null e a submissão pausa
  return undefined;
}
