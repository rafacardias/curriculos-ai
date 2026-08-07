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

export const ConfigSchema = z.object({
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
      // Palavras/termos que, presentes no título (comparação normalizada, palavra inteira), filtram a vaga.
      // Ex.: ["PL", "II", "III", "sênior"] — cobre convenções de nível que a heurística não conhece.
      exclude_title_keywords: z.array(z.string()).default([]),
      // Idiomas que, exigidos em nível NATIVO pelo JD, eliminam a candidatura.
      // Dado versionado, não regex embutido: quem sabe que idiomas fala é o operador.
      blocking_native_languages: z.array(z.string()).default([]),
      // Tecnologias que o operador NÃO tem e que, exigidas, eliminam a vaga.
      // Lista dele, temporária por natureza — sai quando ele aprender.
      blocking_technologies: z.array(z.string()).default([]),
      // Filtra vaga EXPLICITAMENTE presencial/híbrida fora da UF-base. Só explícita:
      // remote_type nulo é ausência de informação, não prova de presencial.
      exclude_onsite_outside_home_uf: z.boolean().default(false),
    })
    .default({}),
  scoring: z
    .object({
      keyword_overlap: z.number().default(0.55),
      recency: z.number().default(0.15),
      // Piso da recência — calibração de escala, não opinião sobre frescor.
      // Ver o comentário longo em config/config.yaml.
      recency_floor: z.number().min(0).max(1).default(0),
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
  // Perfis de harness — o que cada invocação de `claude -p` carrega.
  //
  // `model` NÃO tem default e é obrigatório em todo perfil. Isso é P0, não
  // estilo: `--setting-sources ""` derruba ~/.claude/settings.json inteiro,
  // INCLUSIVE a chave `model`. Na medição M2 de 2026-08-07 o disparo caiu em
  // `claude-opus-5` sem ninguém pedir — $0,4471 e uma medição invalidada. É a
  // CLASSE-01 outra vez: ausência de configuração lida como default seguro.
  // O acidente foi barato num disparo; num lote de 20 não seria.
  harness: z
    .object({
      profiles: z
        .record(
          z.object({
            model: z.string().min(1), // sem .default() — de propósito
            // idem: sem default. `"all"` carrega 150 tools e 80.824 tokens de
            // prefixo — tem de ser uma escolha escrita, não uma omissão.
            tools: z.union([z.array(z.string()), z.literal("all")]),
            allowed_tools: z.array(z.string()).optional(),
            strict_mcp: z.boolean().default(true),
            disable_slash_commands: z.boolean().default(true),
            isolate_settings: z.boolean().default(true),
            max_budget_usd: z.number().positive(),
            effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
            timeout_min: z.number().positive().default(15),
          })
        )
        .default({}),
    })
    .default({}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const CONFIG_PATH = join(PROJECT_ROOT, "config", "config.yaml");

export function loadConfig(): AppConfig {
  const raw = parse(readFileSync(CONFIG_PATH, "utf-8"));
  return ConfigSchema.parse(raw);
}
