import { getDb, nowIso } from "../client.js";

export interface ProfileTrackRow {
  id: string;
  name: string;
  summary: string | null;
  keywords: string; // JSON array
  updated_at: string;
  enabled: number; // SQLite boolean: 0 | 1
}

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Todas as trilhas, ou só as habilitadas. Ordem estável: `id`. */
export function listTracks(opts: { onlyEnabled?: boolean } = {}): ProfileTrackRow[] {
  const where = opts.onlyEnabled ? "WHERE enabled = 1" : "";
  return getDb()
    .prepare(`SELECT * FROM profile_tracks ${where} ORDER BY id`)
    .all() as unknown as ProfileTrackRow[];
}

export function getTrack(id: string): ProfileTrackRow | undefined {
  return getDb().prepare("SELECT * FROM profile_tracks WHERE id = ?").get(id) as unknown as
    | ProfileTrackRow
    | undefined;
}

/**
 * Cria trilha nova. `id` é escolhido pelo operador (não ulid) — é o valor que
 * `jobs.track_hint` grava e a fila exibe como "trilha: <id>", então precisa ser
 * legível. Nunca editável depois de criado (ver `updateTrack`): `track_hint` é
 * TEXT solto, não FK, e renomear o id orfanaria o histórico já pontuado.
 */
export function createTrack(input: {
  id: string;
  name: string;
  summary?: string | null;
  keywords: string[];
}): ProfileTrackRow {
  if (!ID_RE.test(input.id)) {
    throw new Error(`id de trilha inválido: "${input.id}" (use minúsculas, números e hífen)`);
  }
  const db = getDb();
  if (getTrack(input.id)) {
    throw new Error(`trilha "${input.id}" já existe`);
  }
  const row: ProfileTrackRow = {
    id: input.id,
    name: input.name,
    summary: input.summary ?? null,
    keywords: JSON.stringify(input.keywords),
    updated_at: nowIso(),
    enabled: 1,
  };
  db.prepare(
    `INSERT INTO profile_tracks (id, name, summary, keywords, updated_at, enabled)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(row.id, row.name, row.summary, row.keywords, row.updated_at, row.enabled);
  return row;
}

/**
 * Atualiza nome/resumo/keywords/habilitada de uma trilha existente. `id` não
 * está entre os campos editáveis de propósito — ver `createTrack`.
 */
export function updateTrack(
  id: string,
  patch: { name?: string; summary?: string | null; keywords?: string[]; enabled?: boolean }
): ProfileTrackRow {
  const existing = getTrack(id);
  if (!existing) throw new Error(`trilha "${id}" não existe`);
  const next: ProfileTrackRow = {
    ...existing,
    name: patch.name ?? existing.name,
    summary: patch.summary !== undefined ? patch.summary : existing.summary,
    keywords: patch.keywords ? JSON.stringify(patch.keywords) : existing.keywords,
    enabled: patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled,
    updated_at: nowIso(),
  };
  getDb()
    .prepare(
      `UPDATE profile_tracks SET name = ?, summary = ?, keywords = ?, enabled = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(next.name, next.summary, next.keywords, next.enabled, next.updated_at, id);
  return next;
}
