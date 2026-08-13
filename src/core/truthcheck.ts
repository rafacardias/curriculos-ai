import type { MasterProfile } from "./types.js";
import { allFactIds } from "./profile.js";

export interface TruthcheckResult {
  ok: boolean;
  citations: string[];      // fact_ids citados
  invalid: string[];        // citações que não existem no perfil mestre
  uncitedBullets: string[]; // bullets de experiência sem nenhuma citação
}

const CITATION_RE = /\[exp:([^\]]+)\]/g;

export interface CitationValidation {
  citations: string[]; // fact_ids citados (sem duplicata)
  invalid: string[];   // citações que não existem no perfil mestre
}

/**
 * Só a parte do guardrail que independe de formato de currículo: toda citação
 * `[exp:id]` usada em QUALQUER texto (currículo, post do LinkedIn, comentário)
 * tem que apontar pra um fato real. Não exige que o texto cite nada — quem
 * exige cobertura por bullet é o `truthcheck`, específico do currículo.
 */
export function validateCitations(text: string, profile: MasterProfile): CitationValidation {
  const validIds = allFactIds(profile);
  const citations = [...text.matchAll(CITATION_RE)].map((m) => m[1]!.trim());
  const invalid = [...new Set(citations.filter((id) => !validIds.has(id)))];
  return { citations: [...new Set(citations)], invalid };
}

/** Mesma forma do `CITATION_RE`, sem `/g` — `test()` aqui não pode ter estado. */
const HAS_CITATION_RE = /\[exp:[^\]]+\]/;

/**
 * Bullets (linhas começando com "- " ou "* ") da seção de experiência.
 *
 * A seção é delimitada por NÍVEL de heading, não pela última linha de heading
 * vista: o formato canônico do currículo (ver .claude/skills/gerar/SKILL.md)
 * é "## Experiência Profissional" seguido de "### <Cargo> — <Empresa>", e os
 * bullets ficam sob o subheading. Comparar só o texto do último heading fazia
 * a seção desligar no "### Cargo" e os bullets reais escapavam da checagem
 * (BUG-005). Regra: heading MAIS PROFUNDO que o da seção não a encerra; heading
 * de nível igual ou superior encerra.
 *
 * Extraída de dentro do `truthcheck` porque o guardrail de veracidade deixou de
 * ser o único interessado nesses bullets — o gate de formato CAR
 * (`checkWeakBulletPhrasing`) e a nota de resultado numérico do coverage olham
 * exatamente o mesmo recorte, e duplicar a detecção de seção é como o BUG-005
 * nasceria de novo numa cópia.
 */
export function extractExperienceBullets(resumeMd: string): string[] {
  const bullets: string[] = [];
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
    if (inExperience && /^\s*[-*]\s+/.test(line)) bullets.push(line.trim());
  }
  return bullets;
}

/**
 * Guardrail mecânico de veracidade: todo bullet do currículo deve citar um
 * fato real do perfil mestre. Citação inexistente = build falha.
 */
export function truthcheck(resumeMd: string, profile: MasterProfile): TruthcheckResult {
  const { citations, invalid } = validateCitations(resumeMd, profile);

  const uncitedBullets = extractExperienceBullets(resumeMd)
    .filter((b) => !HAS_CITATION_RE.test(b))
    .map((b) => b.slice(0, 80));

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
