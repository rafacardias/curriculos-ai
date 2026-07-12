/**
 * ingest-profile — valida os YAMLs do perfil e sincroniza com o DB.
 *
 *   npx tsx src/cli/ingest-profile.ts validate   # valida master-profile/tracks/candidate-facts
 *   npx tsx src/cli/ingest-profile.ts sync       # valida + upsert em profile_tracks e candidate_facts
 *   npx tsx src/cli/ingest-profile.ts show       # resumo do perfil carregado
 */
import { existsSync } from "node:fs";
import { getDb, nowIso, transaction } from "../db/client.js";
import {
  loadMasterProfile,
  loadTracks,
  loadCandidateFacts,
  allFactIds,
  MASTER_PROFILE_PATH,
} from "../core/profile.js";

const cmd = process.argv[2] ?? "show";

if (!existsSync(MASTER_PROFILE_PATH)) {
  console.error(
    `master-profile.yaml não encontrado em ${MASTER_PROFILE_PATH}.\n` +
      `Rode /perfil no Claude Code para criá-lo a partir dos PDFs em profile/sources/.`
  );
  process.exit(1);
}

const profile = loadMasterProfile();
const tracks = loadTracks();
const candidateFacts = loadCandidateFacts();

// Validações cruzadas
const errors: string[] = [];
const factIds = allFactIds(profile);
const trackIds = new Set(tracks.map((t) => t.id));
for (const exp of profile.experiences) {
  for (const tag of exp.trackTags) {
    if (!trackIds.has(tag)) errors.push(`experiência '${exp.id}' referencia trilha inexistente '${tag}'`);
  }
}
const dupFacts = [...factIds].filter((id, _, arr) => arr.indexOf(id) !== arr.lastIndexOf(id));
if (dupFacts.length) errors.push(`fact ids duplicados: ${dupFacts.join(", ")}`);

if (errors.length) {
  console.error("validação FALHOU:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const summary = () => {
  const nFacts = profile.experiences.reduce((n, e) => n + e.facts.length, 0);
  console.log(`perfil: ${profile.identity.name}`);
  console.log(`experiências: ${profile.experiences.length} · fatos citáveis: ${nFacts}`);
  console.log(`trilhas: ${tracks.map((t) => `${t.id}(${t.keywords.length} kw)`).join(", ") || "(nenhuma)"}`);
  console.log(`candidate_facts: ${candidateFacts.length}`);
};

if (cmd === "validate") {
  console.log("validação OK");
  summary();
} else if (cmd === "sync") {
  const db = getDb();
  transaction(() => {
    const upTrack = db.prepare(
      `INSERT INTO profile_tracks (id, name, summary, keywords, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, summary=excluded.summary,
         keywords=excluded.keywords, updated_at=excluded.updated_at`
    );
    for (const t of tracks) {
      upTrack.run(t.id, t.name, t.summary ?? null, JSON.stringify(t.keywords), nowIso());
    }
    const upFact = db.prepare(
      `INSERT INTO candidate_facts (key, language, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key, language) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
    );
    for (const f of candidateFacts) {
      upFact.run(f.key, f.language, f.value, nowIso());
    }
  });
  console.log(`sync OK: ${tracks.length} trilhas, ${candidateFacts.length} candidate_facts`);
  summary();
} else if (cmd === "show") {
  summary();
} else {
  console.error(`comando desconhecido: ${cmd} (use validate|sync|show)`);
  process.exit(1);
}
