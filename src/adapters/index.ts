import type { JobSourceAdapter } from "./types.js";
import { remotive } from "./remotive.js";
import { remoteok } from "./remoteok.js";
import { wwr } from "./weworkremotely.js";
import { gupy } from "./gupy.js";
import { linkedinGuest } from "./linkedin-guest.js";

export const ALL_ADAPTERS: Record<string, JobSourceAdapter> = {
  remotive,
  remoteok,
  wwr,
  gupy,
  linkedin: linkedinGuest,
};

export function resolveAdapters(ids: string[]): JobSourceAdapter[] {
  return ids
    .map((id) => ALL_ADAPTERS[id])
    .filter((a): a is JobSourceAdapter => Boolean(a));
}
