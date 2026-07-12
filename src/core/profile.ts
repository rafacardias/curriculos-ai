import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { PROJECT_ROOT } from "../db/client.js";
import type { MasterProfile, ProfileTrack } from "./types.js";

export const PROFILE_DIR = join(PROJECT_ROOT, "profile");
export const MASTER_PROFILE_PATH = join(PROFILE_DIR, "master-profile.yaml");
export const TRACKS_PATH = join(PROFILE_DIR, "tracks.yaml");
export const CANDIDATE_FACTS_PATH = join(PROFILE_DIR, "candidate-facts.yaml");

const FactSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  skills: z.array(z.string()).default([]),
});

const ExperienceSchema = z.object({
  id: z.string().min(1),
  company: z.string().min(1),
  role: z.string().min(1),
  start: z.string().optional(),
  end: z.string().optional(),
  track_tags: z.array(z.string()).default([]),
  facts: z.array(FactSchema).default([]),
});

const MasterProfileSchema = z.object({
  identity: z.object({
    name: z.string().min(1),
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().optional(),
    github: z.string().optional(),
    languages: z.array(z.string()).default([]),
  }),
  experiences: z.array(ExperienceSchema).default([]),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string(),
        start: z.string().optional(),
        end: z.string().optional(),
      })
    )
    .default([]),
  certifications: z.array(z.string()).default([]),
  skills: z
    .object({
      hard: z.array(z.string()).default([]),
      soft: z.array(z.string()).default([]),
      tools: z.array(z.string()).default([]),
    })
    .default({}),
});

const TracksSchema = z.object({
  tracks: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      summary: z.string().optional(),
      keywords: z.array(z.string()).default([]),
    })
  ),
});

const CandidateFactsSchema = z.object({
  facts: z
    .array(
      z.object({
        key: z.string().min(1),
        language: z.string().default("pt"),
        value: z.string().min(1),
      })
    )
    .default([]),
});

export function loadMasterProfile(): MasterProfile {
  const raw = MasterProfileSchema.parse(parse(readFileSync(MASTER_PROFILE_PATH, "utf-8")));
  return {
    identity: { ...raw.identity },
    experiences: raw.experiences.map((e) => ({
      id: e.id,
      company: e.company,
      role: e.role,
      start: e.start,
      end: e.end,
      trackTags: e.track_tags,
      facts: e.facts,
    })),
    education: raw.education,
    certifications: raw.certifications,
    skills: raw.skills,
  };
}

export function loadTracks(): ProfileTrack[] {
  if (!existsSync(TRACKS_PATH)) return [];
  return TracksSchema.parse(parse(readFileSync(TRACKS_PATH, "utf-8"))).tracks;
}

export function loadCandidateFacts(): Array<{ key: string; language: string; value: string }> {
  if (!existsSync(CANDIDATE_FACTS_PATH)) return [];
  return CandidateFactsSchema.parse(parse(readFileSync(CANDIDATE_FACTS_PATH, "utf-8"))).facts;
}

/** Todos os fact_ids citáveis — usado pelo truthcheck do kit. */
export function allFactIds(profile: MasterProfile): Set<string> {
  const ids = new Set<string>();
  for (const exp of profile.experiences) {
    ids.add(exp.id);
    for (const fact of exp.facts) ids.add(fact.id);
  }
  return ids;
}
