import type { MasterProfile } from "./types.js";
import { allFactIds } from "./profile.js";

export interface TruthcheckResult {
  ok: boolean;
  citations: string[];      // fact_ids citados
  invalid: string[];        // citações que não existem no perfil mestre
  uncitedBullets: string[]; // bullets de experiência sem nenhuma citação
}

const CITATION_RE = /\[exp:([^\]]+)\]/g;

/**
 * Guardrail mecânico de veracidade: todo bullet do currículo deve citar um
 * fato real do perfil mestre. Citação inexistente = build falha.
 */
export function truthcheck(resumeMd: string, profile: MasterProfile): TruthcheckResult {
  const validIds = allFactIds(profile);
  const citations = [...resumeMd.matchAll(CITATION_RE)].map((m) => m[1]!.trim());
  const invalid = [...new Set(citations.filter((id) => !validIds.has(id)))];

  // Bullets (linhas começando com "- ") na seção de experiências devem citar.
  const uncitedBullets: string[] = [];
  let inExperience = false;
  for (const line of resumeMd.split("\n")) {
    if (/^#{1,3}\s/.test(line)) {
      inExperience = /experi[êe]ncia|experience/i.test(line);
      continue;
    }
    if (inExperience && /^\s*[-*]\s+/.test(line) && !CITATION_RE.test(line)) {
      uncitedBullets.push(line.trim().slice(0, 80));
    }
    CITATION_RE.lastIndex = 0;
  }

  return {
    ok: invalid.length === 0 && uncitedBullets.length === 0,
    citations: [...new Set(citations)],
    invalid,
    uncitedBullets,
  };
}

/** Remove as tags de citação antes de renderizar o PDF. */
export function stripCitations(resumeMd: string): string {
  return resumeMd.replace(/\s*\[exp:[^\]]+\]/g, "");
}
