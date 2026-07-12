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
  if (/\b(head|director|diretor|vp|cto|cmo|coo|ceo|gerente|manager)\b/.test(t)) return "leadership";
  return undefined;
}
