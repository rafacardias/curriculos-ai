/**
 * master — o currículo-mestre por trilha (Estágio 1 da geração em dois estágios).
 *
 *   npx tsx src/cli/master.ts build <trilha>   # emite os fatos da trilha p/ redigir
 *   npx tsx src/cli/master.ts check <trilha>   # valida o YAML contra o perfil real
 *   npx tsx src/cli/master.ts ceiling <trilha> <job_id>   # teto de cobertura
 *   npx tsx src/cli/master.ts rejected <trilha> # regera o relatório de descarte
 *
 * Mesmo sanduíche do `kit.ts`: o determinístico é script, o julgamento é do
 * Claude, e a palavra final é do operador — um mestre com `reviewed_at` nulo é
 * recusado por `check` e por qualquer consumidor.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, PROJECT_ROOT } from "../db/client.js";
import { getJob } from "../db/repo/jobs.js";
import { loadMasterProfile } from "../core/profile.js";
import { extractKeywords, termsPresent } from "../core/keywords.js";
import {
  masterPath,
  parseMaster,
  validateMaster,
  profileFactsHash,
  lostVocabulary,
  classifyDiscard,
  type Discard,
  MASTERS_DIR,
} from "../core/master-resume.js";

const [cmd, track, jobId] = process.argv.slice(2);
if (!cmd || !track || !["build", "check", "ceiling", "rejected"].includes(cmd)) {
  console.error("uso: master build|check|rejected <trilha> · master ceiling <trilha> <job_id>");
  process.exit(1);
}

const profile = loadMasterProfile();

/** Fatos cujas experiências carregam a tag da trilha. */
function factsOfTrack(t: string) {
  return profile.experiences
    .filter((e) => e.trackTags.includes(t))
    .flatMap((e) => e.facts.map((f) => ({ exp: e, fact: f })));
}

if (cmd === "build") {
  const db = getDb();
  const row = db.prepare("SELECT id, name, keywords FROM profile_tracks WHERE id = ?").get(track) as
    | { id: string; name: string; keywords: string }
    | undefined;
  if (!row) {
    console.error(`trilha '${track}' não existe em profile_tracks — rode /perfil primeiro.`);
    process.exit(1);
  }
  const daTrilha = factsOfTrack(track);
  console.log(
    JSON.stringify(
      {
        track: row.id,
        track_name: row.name,
        track_lexicon: JSON.parse(row.keywords),
        source_hash: profileFactsHash(profile),
        destino: masterPath(track),
        // Só os fatos da trilha, não o perfil inteiro: o mestre é por trilha.
        experiencias: profile.experiences
          .filter((e) => e.trackTags.includes(track))
          .map((e) => ({
            id: e.id,
            company: e.company,
            role: e.role,
            start: e.start,
            end: e.end,
            facts: e.facts,
          })),
        total_de_fatos: daTrilha.length,
      },
      null,
      2
    )
  );
} else if (cmd === "check") {
  const p = masterPath(track);
  if (!existsSync(p)) {
    console.error(`não existe: ${p}`);
    console.error(`(diretório dos mestres: ${MASTERS_DIR})`);
    process.exit(1);
  }
  const master = parseMaster(readFileSync(p, "utf-8"));
  const problemas = validateMaster(master, profile);

  const sinonimos = master.bullets.reduce((n, b) => n + b.synonyms.length, 0);
  console.log(`mestre '${track}' v${master.version} — ${master.bullets.length} bullets · ${sinonimos} sinônimos`);
  console.log(`revisado em: ${master.reviewed_at ?? "AINDA NÃO — uso bloqueado"}`);

  // Vocabulário perdido na reescrita — não reprova, mas é cobertura jogada fora.
  const porId = new Map(profile.experiences.flatMap((e) => e.facts.map((f) => [f.id, f] as const)));
  const perdas = master.bullets
    .map((b) => {
      const f = porId.get(b.fact_id);
      return f ? { id: b.fact_id, palavras: lostVocabulary(b, f.text, f.skills) } : null;
    })
    .filter((x): x is { id: string; palavras: string[] } => x != null && x.palavras.length > 0)
    .sort((a, b) => b.palavras.length - a.palavras.length);

  if (perdas.length) {
    const total = perdas.reduce((n, p) => n + p.palavras.length, 0);
    console.log(`\n⚠️  ${total} palavras do fato não sobreviveram ao bullet nem viraram sinônimo.`);
    console.log("   Cada uma é sinônimo de graça — já tem lastro, veio do próprio fato.");
    for (const x of perdas.slice(0, 8)) {
      console.log(`   ${x.id.padEnd(26)} ${x.palavras.slice(0, 10).join(" · ")}`);
    }
    if (perdas.length > 8) console.log(`   … +${perdas.length - 8} bullets`);
  }

  if (!problemas.length) {
    console.log("\n✅ válido: todo fact_id existe, todo bullet cita, todo sinônimo tem lastro no fato.");
    process.exit(0);
  }
  console.error(`\n❌ ${problemas.length} problema(s):`);
  for (const x of problemas) console.error(`  [${x.kind}] ${x.detail}`);
  process.exit(2);
} else if (cmd === "rejected") {
  // O relatório de descarte é DERIVADO, não guardado: ele é gitignorado (deriva
  // dos fatos reais) e portanto não sobrevive a um clone limpo. Guardar seria
  // fingir durabilidade. Regenerável a qualquer momento é honesto — e o comando
  // é a fonte da verdade, não o arquivo.
  const master = parseMaster(readFileSync(masterPath(track), "utf-8"));
  const porId = new Map(profile.experiences.flatMap((e) => e.facts.map((f) => [f.id, f] as const)));

  const demanda = new Set<string>();
  for (const j of getDb().prepare("SELECT title, description FROM jobs").all() as Array<{ title: string; description: string | null }>) {
    for (const k of extractKeywords(`${j.title}\n${j.description ?? ""}`, 30)) {
      for (const parte of k.term.split(" ")) demanda.add(parte);
    }
  }

  const descartes: Discard[] = [];
  for (const b of master.bullets) {
    const f = porId.get(b.fact_id);
    if (!f) continue;
    for (const w of lostVocabulary(b, f.text, f.skills)) {
      const reason = classifyDiscard(w, demanda);
      if (reason) descartes.push({ term: w, factId: b.fact_id, reason });
    }
  }

  const md = [
    `# Sinônimos descartados — trilha ${track}`,
    "",
    "**Arquivo DERIVADO.** Gitignorado, porque deriva dos fatos reais, e portanto não",
    "sobrevive a um clone limpo. Não guarde: regere com",
    "`npx tsx src/cli/master.ts rejected " + track + "`. O comando é a fonte da verdade.",
    "",
    "Vocabulário que o fato tinha, o bullet perdeu na reescrita, e que **não** virou sinônimo.",
    "",
    "- **verbo** — verbo de narração conjugado; já está no bullet, e JD pede substantivo.",
    "- **generico** — preposição, numeral, palavra de ligação. Não discrimina nada.",
    `- **sem-demanda** — nunca extraída como keyword de nenhum JD do acervo (${demanda.size} termos de demanda).`,
    "",
    "> Ressalva: `extractKeywords` é frequência pura e produz ruído nas duas direções",
    "> (mede `clube vantagens`, `você`). O sinal de demanda é imperfeito. Discordou de um",
    "> descarte? Mova a linha para o YAML do mestre com o `from` correspondente.",
    "",
    `Total: **${descartes.length}** descartados.`,
    "",
    "| termo | fato de origem | motivo |",
    "|---|---|---|",
    ...descartes
      .sort((a, b) => a.reason.localeCompare(b.reason) || a.term.localeCompare(b.term))
      .map((r) => `| \`${r.term}\` | \`${r.factId}\` | ${r.reason} |`),
    "",
  ].join("\n");

  const destino = join(PROJECT_ROOT, "profile", `synonyms-rejected-${track}.md`);
  writeFileSync(destino, md, "utf-8");
  console.log(`${descartes.length} descartes → ${destino}`);
  for (const m of ["verbo", "generico", "sem-demanda"] as const) {
    console.log(`  ${m.padEnd(12)} ${descartes.filter((d) => d.reason === m).length}`);
  }
} else {
  // ceiling — o número que a Fase 2 nunca pode superar
  if (!jobId) {
    console.error("uso: master ceiling <trilha> <job_id>");
    process.exit(1);
  }
  const job = getJob(jobId);
  if (!job) {
    console.error(`vaga não encontrada: ${jobId}`);
    process.exit(1);
  }
  const kws = extractKeywords(`${job.title}\n${job.description ?? ""}`, 30).map((k) => k.term);

  const p = masterPath(track);
  const master = existsSync(p) ? parseMaster(readFileSync(p, "utf-8")) : null;

  // Três tetos, do mais restrito ao mais frouxo. A diferença entre eles é
  // exatamente o que os sinônimos compram — e cada um desses termos tem lastro
  // nomeado, ao contrário dos três que o LLM inventou no kit da Stefanini.
  // Escopado À TRILHA. Comparar o mestre de uma trilha contra os fatos de TODAS
  // é comparação injusta — o mestre perderia por definição, e a conclusão seria
  // sobre o recorte, não sobre a redação.
  const corpusFatos = factsOfTrack(track)
    .map(({ fact }) => `${fact.text} ${fact.skills.join(" ")}`)
    .join(" \n ");
  const corpusMestre = master ? master.bullets.map((b) => b.text).join(" \n ") : "";
  const corpusMestreSin = master
    ? corpusMestre + " " + master.bullets.flatMap((b) => b.synonyms.map((s) => s.term)).join(" ")
    : "";

  const linha = (rotulo: string, corpus: string) => {
    const c = termsPresent(corpus, kws);
    console.log(
      `  ${rotulo.padEnd(34)} ${String(c.length).padStart(2)}/${kws.length}  ${String(Math.round((100 * c.length) / kws.length)).padStart(3)}%`
    );
    return c;
  };

  console.log(`TETO DE COBERTURA — ${job.title} (${job.company_name})`);
  console.log(`trilha ${track} · top ${kws.length} keywords do JD\n`);
  const tetoFatos = linha("fatos crus do perfil", corpusFatos);
  if (master) {
    linha("bullets do mestre", corpusMestre);
    const comSin = linha("bullets + sinônimos (TETO REAL)", corpusMestreSin);
    console.log(
      `\nGanho dos sinônimos: ${comSin.length - termsPresent(corpusMestre, kws).length} keyword(s).`
    );
    console.log("Cobertas com lastro:", comSin.join(" · ") || "(nenhuma)");
    console.log(
      "\nEste é o número que a Fase 2 NUNCA pode superar. Superar significa que apareceu",
      "\nvocabulário sem fato — o defeito que originou o BUG-008."
    );
  } else {
    console.log(`\n(mestre ainda não existe em ${p} — mostrando só o teto dos fatos crus)`);
    console.log("Cobertas:", tetoFatos.join(" · ") || "(nenhuma)");
  }
}
