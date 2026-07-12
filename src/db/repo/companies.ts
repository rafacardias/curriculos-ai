import { ulid } from "ulid";
import { getDb, nowIso } from "../client.js";
import { normalize } from "../../core/dedup.js";

export interface CompanyRow {
  id: string;
  name: string;
  name_normalized: string;
  domain: string | null;
  industry: string | null;
  notes: string | null;
  applications_count: number;
  responses_count: number;
  interviews_count: number;
}

/** Busca ou cria a empresa pelo nome normalizado (company memory). */
export function upsertCompany(name: string): CompanyRow {
  const db = getDb();
  const norm = normalize(name);
  const existing = db
    .prepare("SELECT * FROM companies WHERE name_normalized = ?")
    .get(norm) as CompanyRow | undefined;
  if (existing) return existing;
  const row: CompanyRow = {
    id: ulid(),
    name,
    name_normalized: norm,
    domain: null,
    industry: null,
    notes: null,
    applications_count: 0,
    responses_count: 0,
    interviews_count: 0,
  };
  db.prepare(
    `INSERT INTO companies (id, name, name_normalized, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(row.id, row.name, row.name_normalized, nowIso(), nowIso());
  return row;
}

export function getCompanyByName(name: string): CompanyRow | undefined {
  return getDb()
    .prepare("SELECT * FROM companies WHERE name_normalized = ?")
    .get(normalize(name)) as CompanyRow | undefined;
}

export function bumpCompanyStat(
  companyId: string,
  stat: "applications_count" | "responses_count" | "interviews_count"
): void {
  getDb()
    .prepare(`UPDATE companies SET ${stat} = ${stat} + 1, updated_at = ? WHERE id = ?`)
    .run(nowIso(), companyId);
}
