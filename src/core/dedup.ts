import { createHash } from "node:crypto";
import type { AtsPlatform, RawJob } from "./types.js";

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Fingerprint canônico da vaga — mesma vaga em fontes diferentes colide de propósito. */
export function jobFingerprint(job: Pick<RawJob, "companyName" | "title" | "location">): string {
  const key = `${normalize(job.companyName)}|${normalize(job.title)}|${normalize(job.location ?? "")}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

/** Detecta a plataforma ATS pela URL — decide qual SubmissionAdapter usar. */
export function detectAtsPlatform(url: string): AtsPlatform {
  const u = url.toLowerCase();
  if (u.includes("greenhouse.io")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("myworkdayjobs.com") || u.includes("workday")) return "workday";
  if (u.includes("gupy.io")) return "gupy";
  if (u.includes("linkedin.com")) return "linkedin";
  return "other";
}

/** Heurística de senioridade a partir do título. */
export function detectSeniority(title: string): string | undefined {
  const t = normalize(title);
  if (/\b(intern|estagiario|estagio|trainee)\b/.test(t)) return "intern";
  if (/\b(junior|jr)\b/.test(t)) return "junior";
  if (/\b(pleno|mid|middle)\b/.test(t)) return "mid";
  if (/\b(senior|sr|especialista|specialist)\b/.test(t)) return "senior";
  if (/\b(lead|lider|principal|staff)\b/.test(t)) return "lead";
  // "manager/gerente" só é liderança quando NÃO faz parte de cargo de produto/projeto
  // (Product Manager, Gerente de Projetos etc. são funções IC, não chefia)
  const tLead = t
    .replace(/\b(product|project|produto|projeto)s?\s+manager\b/g, "")
    .replace(/\bgerente de (produtos?|projetos?)\b/g, "");
  if (/\b(head|director|diretor|vp|cto|cmo|coo|ceo|gerente|manager)\b/.test(tLead)) return "leadership";
  return undefined;
}

/**
 * Anos de experiência exigidos pelo JD ("8+ anos de experiência", "5-7 years of experience").
 * Retorna o MAIOR requisito mencionado; num intervalo ("5-7 anos") vale o mínimo (5).
 * Padrão amarrado a "experiência/experience" para não confundir com "empresa com 20 anos de mercado".
 */
export function detectRequiredYears(text: string): number | undefined {
  const t = text.toLowerCase();
  const re = /(\d{1,2})\s*(?:\+|\s*(?:a|-|to)\s*\d{1,2})?\s*(?:anos?|years?)(?:\s+(?:de|of))?\s+experi[êe]nc/g;
  let max: number | undefined;
  for (const m of t.matchAll(re)) {
    const n = parseInt(m[1] ?? "0", 10);
    if (n >= 1 && n <= 30 && (max === undefined || n > max)) max = n;
  }
  return max;
}
