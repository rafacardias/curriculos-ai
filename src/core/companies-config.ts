/**
 * Cadastro de empresas vigiadas — `config/companies.yaml`.
 *
 * Config, não banco: o operador cura a lista à mão, mesmo padrão de
 * `config.yaml → searches[]`. Nenhum campo aqui pode existir sem que algum
 * código o leia (ACHADO-08, `remote_only` decorativo) — é por isso que não há
 * `tags` (metadado que nada consumiria) nem `poll` por empresa (intervalo é
 * global nesta fase).
 *
 * `ats` é `z.enum` fechado de propósito: declarar uma empresa com um ATS que
 * `company-watch.ts` ainda não sabe buscar tem que FALHAR alto na validação,
 * não ser silenciosamente ignorada.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { PROJECT_ROOT } from "../db/client.js";

export const COMPANIES_CONFIG_PATH = join(PROJECT_ROOT, "config", "companies.yaml");

export const CompanyWatchSchema = z.object({
  name: z.string().min(1),
  ats: z.enum(["gupy"]),
  handle: z.string().min(1),
  /** ids de `profile_tracks` — léxico já existe, não duplicado aqui. */
  tracks: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

export type CompanyWatch = z.infer<typeof CompanyWatchSchema>;

const CompaniesConfigSchema = z.array(CompanyWatchSchema);

export function loadCompaniesConfig(): CompanyWatch[] {
  if (!existsSync(COMPANIES_CONFIG_PATH)) return [];
  return CompaniesConfigSchema.parse(parse(readFileSync(COMPANIES_CONFIG_PATH, "utf-8")));
}
