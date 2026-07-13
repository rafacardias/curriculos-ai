import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { PROJECT_ROOT } from "../db/client.js";

export const SearchSpec = z.object({
  query: z.string().default(""),
  sources: z.array(z.string()).default(["remotive", "remoteok", "wwr", "gupy"]),
  location: z.string().optional(),
  remote_only: z.boolean().default(false),
});

const ConfigSchema = z.object({
  auto_search: z.union([z.boolean(), z.enum(["on", "off"])]).transform((v) => v === true || v === "on"),
  auto_search_hour: z.number().int().min(0).max(23).default(9),
  // Dias da semana em que a busca automática roda (0=domingo … 6=sábado). Vazio/omitido = todos os dias.
  auto_search_days: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  searches: z.array(SearchSpec).default([]),
  queue_threshold: z.number().default(40),
  // Filtros duros — vaga filtrada não entra na fila (status new, motivo no policy_action)
  filters: z
    .object({
      exclude_seniority: z.array(z.string()).default([]), // intern|junior|mid|senior|lead|leadership
      max_years_required: z.number().int().min(0).max(30).nullable().default(null),
    })
    .default({}),
  scoring: z
    .object({
      keyword_overlap: z.number().default(0.55),
      recency: z.number().default(0.15),
      location_fit: z.number().default(0.15),
      language_fit: z.number().default(0.05),
      preference: z.number().default(0.1),
    })
    .default({}),
  policy: z
    .object({
      generate_min_score: z.number().default(60),
      full_auto_min_score: z.number().default(80),
      full_auto_blocked_sources: z.array(z.string()).default(["linkedin"]),
      weekly_cap_per_track: z.number().default(25),
      prefer_responsive_companies: z.boolean().default(true),
      cooldown_same_company_days: z.number().default(30),
    })
    .default({}),
  submission: z
    .object({
      default_mode: z.enum(["review_first", "approve_batch", "full_auto"]).default("review_first"),
      per_platform: z.record(z.enum(["review_first", "approve_batch", "full_auto"])).default({}),
      i_accept_ban_risk: z.boolean().default(false),
    })
    .default({}),
  experiments: z
    .object({
      enabled: z.boolean().default(true),
      min_n_to_compare: z.number().default(8),
    })
    .default({}),
  preferences: z
    .object({
      max_weight: z.number().default(10),
      decay: z.number().default(0.95),
    })
    .default({}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const CONFIG_PATH = join(PROJECT_ROOT, "config", "config.yaml");

export function loadConfig(): AppConfig {
  const raw = parse(readFileSync(CONFIG_PATH, "utf-8"));
  return ConfigSchema.parse(raw);
}
