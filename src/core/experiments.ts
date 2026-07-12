import { getDb } from "../db/client.js";

export interface Variant {
  id: string;
  headline_style: "metric-first" | "role-first";
  summary_style: "resultados" | "posicionamento";
  instructions: string;
}

/** Variantes testáveis do currículo — mantidas poucas de propósito (n pequeno). */
export const VARIANTS: Variant[] = [
  {
    id: "A",
    headline_style: "metric-first",
    summary_style: "resultados",
    instructions:
      "Resumo abre com a métrica mais forte da trilha (ex.: 'Growth que elevou ROAS 78%...'); bullets ordenados por impacto quantificado.",
  },
  {
    id: "B",
    headline_style: "role-first",
    summary_style: "posicionamento",
    instructions:
      "Resumo abre com posicionamento de cargo alinhado ao título da vaga; bullets ordenados por relevância de responsabilidade vs o JD.",
  },
];

/**
 * Atribuição round-robin por segmento (trilha × fonte): alterna a variante a
 * cada kit gerado no mesmo segmento, para acumular comparação justa.
 */
export function assignVariant(trackId: string | null, source: string): Variant {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM resume_versions rv
       JOIN applications a ON a.id = rv.application_id
       JOIN jobs j ON j.id = a.job_id
       WHERE COALESCE(a.track_id,'') = COALESCE(?, '') AND j.source = ?`
    )
    .get(trackId, source) as { n: number };
  return VARIANTS[row.n % VARIANTS.length]!;
}
