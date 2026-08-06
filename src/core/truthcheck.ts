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
  //
  // A seção é delimitada por NÍVEL de heading, não pela última linha de heading
  // vista: o formato canônico do currículo (ver .claude/skills/gerar/SKILL.md)
  // é "## Experiência Profissional" seguido de "### <Cargo> — <Empresa>", e os
  // bullets ficam sob o subheading. Comparar só o texto do último heading fazia
  // a seção desligar no "### Cargo" e os bullets reais escapavam da checagem.
  // Regra: heading MAIS PROFUNDO que o da seção não a encerra; heading de nível
  // igual ou superior encerra.
  const uncitedBullets: string[] = [];
  let inExperience = false;
  let sectionLevel = 0;
  for (const line of resumeMd.split("\n")) {
    const heading = /^(#{1,6})\s/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      if (/experi[êe]ncia|experience/i.test(line)) {
        inExperience = true;
        sectionLevel = level;
      } else if (inExperience && level <= sectionLevel) {
        inExperience = false;
      }
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
