/**
 * Resolução hierárquica de localidade — cidade → UF → país.
 *
 * BUG-006: `location_fit` só reconhecia o Brasil quando a string continha
 * literalmente "Brasil"/"Brazil". A Gupy devolve "São Paulo, SP" e "Belo
 * Horizonte, Minas Gerais", então 119 vagas brasileiras não-remotas recebiam
 * metade da pontuação de localização que mereciam, enquanto qualquer vaga marcada
 * `remote` num board internacional ganhava a pontuação cheia de graça.
 *
 * O léxico é dado versionado em `config/locality.yaml`, não regex no código: é o
 * operador quem sabe onde mora e quais cidades importam para ele.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { PROJECT_ROOT } from "../db/client.js";

const LexiconSchema = z.object({
  base: z.object({ city: z.string(), uf: z.string(), country: z.string() }),
  country_aliases: z.record(z.array(z.string())).default({}),
  remote_eligible_regions: z.array(z.string()).default([]),
  ufs: z.record(z.string()).default({}),
  cities: z.record(z.string()).default({}),
});

export type LocalityLexicon = z.infer<typeof LexiconSchema>;

export const LOCALITY_PATH = join(PROJECT_ROOT, "config", "locality.yaml");

let cached: LocalityLexicon | null = null;

export function loadLocalityLexicon(): LocalityLexicon {
  if (cached) return cached;
  cached = LexiconSchema.parse(parse(readFileSync(LOCALITY_PATH, "utf-8")));
  return cached;
}

/** Somente para teste: descarta o cache do léxico. */
export function resetLocalityCache(): void {
  cached = null;
}

/** Minúsculas, sem acento, pontuação virando espaço. "São Paulo/SP" → "sao paulo sp". */
export function normalizeLocation(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Como a localidade foi reconhecida. Quanto mais específico, mais confiança. */
export type LocalityLevel = "city" | "uf" | "country" | "foreign" | "unknown";

export interface ResolvedLocality {
  level: LocalityLevel;
  /** ISO-2 do país quando reconhecido; null se desconhecido. */
  country: string | null;
  uf: string | null;
  city: string | null;
  /** true se resolveu para o país-base do operador. */
  isHome: boolean;
  /** true se está na UF-base do operador. */
  isHomeUf: boolean;
}

const UNKNOWN: ResolvedLocality = {
  level: "unknown",
  country: null,
  uf: null,
  city: null,
  isHome: false,
  isHomeUf: false,
};

/** Palavra inteira, sobre a string já normalizada. */
function hasWord(haystack: string, needle: string): boolean {
  const n = normalizeLocation(needle);
  if (!n) return false;
  return ` ${haystack} `.includes(` ${n} `);
}

/**
 * Resolve uma string de localidade pela hierarquia cidade → UF → país.
 *
 * Achar a cidade implica a UF, que implica o país — é por isso que a ordem
 * importa: "São Paulo, SP" resolve no primeiro passo e já sai com país BR, sem
 * a string nunca ter mencionado o Brasil.
 */
export function resolveLocality(
  raw: string | null | undefined,
  lex: LocalityLexicon = loadLocalityLexicon()
): ResolvedLocality {
  if (!raw?.trim()) return UNKNOWN;
  const s = normalizeLocation(raw);
  const homeCountry = lex.base.country;
  const homeUf = normalizeLocation(lex.base.uf);

  // 1. cidade → UF → país
  for (const [city, uf] of Object.entries(lex.cities)) {
    if (hasWord(s, city)) {
      return {
        level: "city",
        country: homeCountry,
        uf,
        city,
        isHome: true,
        isHomeUf: normalizeLocation(uf) === homeUf,
      };
    }
  }

  // 2. UF por nome oficial (mais específico que a sigla) e depois por sigla.
  for (const [sigla, nome] of Object.entries(lex.ufs)) {
    if (hasWord(s, nome)) {
      return { level: "uf", country: homeCountry, uf: sigla, city: null, isHome: true, isHomeUf: normalizeLocation(sigla) === homeUf };
    }
  }
  for (const sigla of Object.keys(lex.ufs)) {
    // Palavra inteira é obrigatório: senão "PA" casaria dentro de "Palo Alto" e
    // "MS" dentro de "MSc".
    if (hasWord(s, sigla)) {
      return { level: "uf", country: homeCountry, uf: sigla, city: null, isHome: true, isHomeUf: normalizeLocation(sigla) === homeUf };
    }
  }

  // 3. país por alias
  for (const [iso, aliases] of Object.entries(lex.country_aliases)) {
    for (const a of aliases) {
      if (hasWord(s, a)) {
        return { level: "country", country: iso, uf: null, city: null, isHome: iso === homeCountry, isHomeUf: false };
      }
    }
  }

  // 4. Há texto de localidade, e ele não é nenhuma localidade conhecida. Isso é
  //    informação: "Mangaluru, Índia" não é desconhecido, é estrangeiro.
  return { level: "foreign", country: null, uf: null, city: null, isHome: false, isHomeUf: false };
}

/**
 * Um anúncio remoto declara região elegível compatível?
 *
 * Necessário porque o RemoteOK marca 100% do catálogo como `remote` — inclusive
 * uma vaga de bombeiro de aeroporto em Mangaluru. A flag da fonte, portanto, não
 * é evidência de elegibilidade: é uma constante, e constante não carrega
 * informação. Corroboração vem do texto.
 */
export function declaresEligibleRegion(
  text: string | null | undefined,
  lex: LocalityLexicon = loadLocalityLexicon()
): boolean {
  if (!text?.trim()) return false;
  const s = normalizeLocation(text);
  return lex.remote_eligible_regions.some((r) => hasWord(s, r));
}
