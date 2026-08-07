/**
 * master — o currículo-mestre por trilha (Estágio 1 da geração em dois estágios).
 *
 *   npx tsx src/cli/master.ts build <trilha>   # emite os fatos da trilha p/ redigir
 *   npx tsx src/cli/master.ts check <trilha>   # valida o YAML contra o perfil real
 *   npx tsx src/cli/master.ts ceiling <trilha> <job_id>   # teto de cobertura
 *   npx tsx src/cli/master.ts rejected <trilha> # regera o relatório de descarte
 *   npx tsx src/cli/master.ts gaps <trilha>     # lacunas REAIS por vaga da fila
 *   npx tsx src/cli/master.ts review <trilha>   # sinônimos ordenados por risco
 *   npx tsx src/cli/master.ts lexicon all       # REQ-003: léxico sem lastro
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
import { normalizeForCompare } from "../core/gates.js";
import {
  masterPath,
  parseMaster,
  validateMaster,
  profileFactsHash,
  lostVocabulary,
  classifyDiscard,
  auditTags,
  GENERICO,
  type Discard,
  MASTERS_DIR,
} from "../core/master-resume.js";

const [cmd, track, jobId] = process.argv.slice(2);
if (!cmd || !track || !["build", "check", "ceiling", "rejected", "gaps", "review", "lexicon", "tags"].includes(cmd)) {
  console.error("uso: master build|check|rejected|gaps|review|lexicon <trilha|all> · master ceiling <trilha> <job_id>");
  process.exit(1);
}

const profile = loadMasterProfile();

/** Fatos cujas experiências carregam a tag da trilha. */
function factsOfTrack(t: string) {
  return profile.experiences
    .filter((e) => e.trackTags.includes(t))
    .flatMap((e) => e.facts.map((f) => ({ exp: e, fact: f })));
}

if (cmd === "tags") {
  // REQ-004 — auditoria da compressão fato → skills[].
  const alvo = track === "all" ? profile.experiences : profile.experiences.filter((e) => e.trackTags.includes(track));
  const todos = alvo.flatMap((e) => e.facts.flatMap((f) => auditTags(f.id, f.text, f.skills)));
  const porTipo = (k: string) => todos.filter((x) => x.kind === k);

  console.log(`${todos.length} tags em ${alvo.flatMap((e) => e.facts).length} fatos\n`);
  console.log(`  literal      ${String(porTipo("literal").length).padStart(4)}  aparece no texto, sem qualificador depois`);
  console.log(`  truncada     ${String(porTipo("truncada").length).padStart(4)}  ← POPULAÇÃO DE RISCO (REQ-004)`);
  console.log(`  interpretada ${String(porTipo("interpretada").length).padStart(4)}  rótulo atribuído, não extraído do texto`);

  if (porTipo("truncada").length) {
    console.log("\nTRUNCADAS — a tag descartou um qualificador que estava no fato:");
    for (const x of porTipo("truncada")) {
      console.log(`  ${x.factId.padEnd(26)} ${x.tag.padEnd(30)} perdeu: "${x.perdeu}"`);
    }
  }
  const interp = porTipo("interpretada");
  if (interp.length) {
    console.log(`\nINTERPRETADAS (${interp.length}) — sentido não vem do texto, vem de quem etiquetou:`);
    for (const x of interp.slice(0, 25)) console.log(`  ${x.factId.padEnd(26)} ${x.tag}`);
    if (interp.length > 25) console.log(`  … +${interp.length - 25}`);
  }
  process.exit(porTipo("truncada").length ? 2 : 0);
} else if (cmd === "lexicon") {
  // REQ-003 — termo no léxico de trilha sem fato que o comprove é defeito de
  // RANKING, não de redação: o léxico decide o `keyword_overlap`, que é 65% do
  // score, ou seja, decide QUAIS VAGAS entram na fila. Um termo sem lastro faz a
  // fila premiar vaga que pede competência que o perfil não evidencia.
  const trilhas = (
    track === "all"
      ? (getDb().prepare("SELECT id, keywords FROM profile_tracks ORDER BY id").all() as Array<{ id: string; keywords: string }>)
      : (getDb().prepare("SELECT id, keywords FROM profile_tracks WHERE id = ?").all(track) as Array<{ id: string; keywords: string }>)
  );
  if (!trilhas.length) {
    console.error(`trilha '${track}' não existe. Use um id de trilha ou 'all'.`);
    process.exit(1);
  }

  let totalSemLastro = 0;
  let semLastroReal = 0;
  let total = 0;
  for (const tr of trilhas) {
    const termos: string[] = JSON.parse(tr.keywords);
    // Lastro = o termo aparece nos fatos DA PRÓPRIA TRILHA. Um termo sustentado
    // só por experiência de outra trilha não justifica ranquear vaga desta.
    const corpus = factsOfTrack(tr.id)
      .map(({ fact }) => `${fact.text} ${fact.skills.join(" ")}`)
      .join(" \n ");
    const comLastro = new Set(termsPresent(corpus, termos));
    const sem = termos.filter((x) => !comLastro.has(x));
    total += termos.length;
    totalSemLastro += sem.length;

    console.log(`\n${tr.id} — ${termos.length} termos · ${comLastro.size} com lastro · ${sem.length} SEM`);
    if (sem.length) {
      // Onde ele existe no perfil, ainda que fora da trilha? Muda a decisão:
      // retag da experiência é diferente de remover o termo.
      const corpusTudo = profile.experiences
        .map((e) => `${e.role} ${e.facts.map((f) => `${f.text} ${f.skills.join(" ")}`).join(" ")}`)
        .join(" \n ");
      const noutraTrilha = new Set(termsPresent(corpusTudo, sem));
      // `termsPresent` é match exato de token: "teste de regressão" não casa
      // "testes de regressão". Já errei duas vezes nesta base confundindo ausência
      // com limitação do matcher, então a distinção fica explícita na saída.
      const palavrasTrilha = new Set(normalizeForCompare(corpus).split(" ").filter((w) => w.length >= 4));
      let vizinhos = 0;
      for (const x of sem) {
        const partes = normalizeForCompare(x).split(" ").filter((w) => w.length >= 4);
        const temVizinho =
          partes.length > 0 &&
          partes.every((pt) => [...palavrasTrilha].some((w) => w.startsWith(pt.slice(0, 5)) || pt.startsWith(w.slice(0, 5))));
        if (temVizinho) vizinhos++;
        const onde = noutraTrilha.has(x)
          ? profile.experiences
              .filter((e) => termsPresent(`${e.role} ${e.facts.map((f) => f.text + " " + f.skills.join(" ")).join(" ")}`, [x]).length)
              .map((e) => e.trackTags.join("/"))
          : [];
        const nota = temVizinho
          ? "variante morfológica existe na trilha"
          : onde.length
            ? `existe, mas em: ${[...new Set(onde)].join(", ")}`
            : "SEM LASTRO NENHUM";
        console.log(`   ${temVizinho ? "~" : "✗"} ${x.padEnd(34)} ${nota}`);
      }
      console.log(`     └─ dos ${sem.length}: ${vizinhos} são variante morfológica · ${sem.length - vizinhos} sem lastro real`);
      semLastroReal += sem.length - vizinhos;
    }
  }
  console.log(`\n${totalSemLastro} de ${total} termos sem match literal (${Math.round((100 * totalSemLastro) / total)}%).`);
  console.log(`Destes, ${totalSemLastro - semLastroReal} são variante morfológica de algo que a trilha TEM.`);
  console.log(`SEM LASTRO REAL: ${semLastroReal} de ${total} (${Math.round((100 * semLastroReal) / total)}%) — estes empurram a fila`);
  console.log("para vagas que pedem competência que o perfil não evidencia (REQ-003).");
  process.exit(semLastroReal ? 2 : 0);
} else if (cmd === "build") {
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
} else if (cmd === "gaps" || cmd === "review") {
  const master = parseMaster(readFileSync(masterPath(track), "utf-8"));
  const porIdRev = new Map(profile.experiences.flatMap((e) => e.facts.map((f) => [f.id, f] as const)));
  const corpusMestre =
    master.bullets.map((b) => b.text).join(" \n ") +
    " " +
    master.bullets.flatMap((b) => b.synonyms.map((s) => s.term)).join(" ");
  const corpusPerfil = [
    ...profile.experiences.flatMap((e) => [e.role, ...e.facts.map((f) => `${f.text} ${f.skills.join(" ")}`)]),
    ...profile.skills.hard, ...profile.skills.soft, ...profile.skills.tools,
    ...profile.certifications,
  ].join(" \n ");
  const palavrasPerfil = new Set(normalizeForCompare(corpusPerfil).split(" ").filter((w) => w.length >= 4));

  if (cmd === "gaps") {
    // Lacuna REAL = o que sobra depois de tirar ruído do anúncio e grafia diferente.
    // O que importa não é a lista por vaga: é a FREQUÊNCIA na fila. Um termo que
    // falta em 8 vagas é uma tarde de estudo que destrava 8 candidaturas; um que
    // falta em 1 é ruído com nome bonito.
    const vagas = getDb()
      .prepare("SELECT id,title,company_name,description FROM jobs WHERE status='queued' AND track_hint = ? ORDER BY score DESC")
      .all(track) as Array<{ id: string; title: string; company_name: string; description: string | null }>;

    const freq = new Map<string, { n: number; vagas: string[] }>();
    for (const j of vagas) {
      const empresa = normalizeForCompare(j.company_name).split(" ").filter((w) => w.length >= 3);
      const kws = extractKeywords(`${j.title}\n${j.description ?? ""}`, 30).map((k) => k.term);
      const cobre = new Set([...termsPresent(corpusMestre, kws), ...termsPresent(corpusPerfil, kws)]);
      for (const k of kws) {
        if (cobre.has(k)) continue;
        const partes = k.split(" ");
        if (partes.some((p) => empresa.includes(p))) continue;                    // ruído
        // Toda parte genérica → é frase institucional, não requisito. Sem isto o
        // topo da lista vira `voce`, `solucoes`, `dados` — o REQ-002 em ação.
        if (partes.every((p) => GENERICO.test(p) || p.length < 4)) continue;
        if (partes.every((p) => palavrasPerfil.has(p))) continue;                 // grafia
        // Prefixo de 4 chars, não 5: `llms` contra `llm` estava escapando e virando
        // "lacuna" quando é plural de algo que ele tem.
        const vizinho = partes.some((p) => p.length >= 4 &&
          [...palavrasPerfil].some((w) => w.startsWith(p.slice(0, 4)) || p.startsWith(w.slice(0, 4))));
        if (vizinho) continue;                                                    // morfologia
        const e = freq.get(k) ?? { n: 0, vagas: [] };
        e.n++; if (e.vagas.length < 4) e.vagas.push(j.title.slice(0, 34));
        freq.set(k, e);
      }
    }
    const ranked = [...freq].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n);
    const md = [
      `# Lacunas candidatas — trilha ${track}`, "",
      "**Arquivo DERIVADO e PROVISÓRIO.** Regere com `npx tsx src/cli/master.ts gaps " + track + "`.", "",
      "> ⚠️ **Esta lista não é confiável hoje** — ver `KNOWN-BUGS.md` REQ-002. Sem segmentação do",
      "> JD, o extrator devolve texto institucional como se fosse requisito, e o topo da tabela",
      "> enche de `voce`, `solucoes`, `dados`. Tentar limpar isso estendendo a lista de palavras",
      "> genéricas é curar sintoma: a causa é o denominador. A **leitura curada** das lacunas que",
      "> de fato importam está em `KNOWN-BUGS.md`, seção ACHADO-04 — commitada e greppável.", "",
      "O que sobra do JD depois de descontar ruído do anúncio, vocabulário que você tem com outra",
      "grafia, e variantes morfológicas. Onde o sinal é real, **nenhum sinônimo, reescrita ou gate",
      "move estas linhas** — só estudo ou projeto novo move.", "",
      `Base: ${vagas.length} vagas \`queued\` da trilha. Listado o que falta em **2+ vagas** —`,
      "abaixo disso é ruído do extrator com nome bonito.", "",
      "> Ressalva do REQ-002: o denominador ainda não é segmentado, então parte do que aparece",
      "> aqui pode ser artefato de bigrama, não pedido do anunciante. Leia a coluna de frequência",
      "> como prioridade, não como verdade.", "",
      "| falta em | termo | exemplos de vaga |", "|---:|---|---|",
      ...ranked.map(([k, v]) => `| **${v.n}** | \`${k}\` | ${v.vagas.join(" · ")} |`),
      "",
      ranked.length ? "" : "_(nenhum termo falta em 2+ vagas)_",
    ].join("\n");
    const dest = join(PROJECT_ROOT, "profile", `gaps-${track}.md`);
    writeFileSync(dest, md, "utf-8");
    console.log(`${ranked.length} lacunas em 2+ vagas (de ${vagas.length} vagas) → ${dest}`);
    for (const [k, v] of ranked.slice(0, 10)) console.log(`  ${String(v.n).padStart(3)}×  ${k}`);
  } else {
    // review — ordenado por RISCO, não por ordem de arquivo.
    const lexico = new Set(
      normalizeForCompare(
        ((getDb().prepare("SELECT keywords FROM profile_tracks WHERE id = ?").get(track) as { keywords: string } | undefined)
          ? JSON.parse((getDb().prepare("SELECT keywords FROM profile_tracks WHERE id = ?").get(track) as { keywords: string }).keywords).join(" ")
          : "")
      ).split(" ")
    );
    type Item = { fato: string; term: string; from: string; risco: number; tipo: string; origem: string };
    const itens: Item[] = [];
    for (const b of master.bullets) {
      const fato = porIdRev.get(b.fact_id);
      const auditoria = fato ? new Map(auditTags(b.fact_id, fato.text, fato.skills).map((a) => [normalizeForCompare(a.tag), a.kind])) : new Map();
      for (const s of b.synonyms) {
        const nt = normalizeForCompare(s.term), nf = normalizeForCompare(s.from);
        if (nt === nf) continue; // os mecânicos: from é a própria palavra
        const tokT = new Set(nt.split(" ")), tokF = nf.split(" ");
        const compartilha = tokF.some((w) => tokT.has(w));
        const morfo = !compartilha && tokF.some((f) => f.length >= 5 &&
          [...tokT].some((w) => w.startsWith(f.slice(0, 5)) || f.startsWith(w.slice(0, 5))));
        const noLexico = nt.split(" ").every((w) => lexico.has(w));
        const tipo = compartilha ? "derivado" : morfo ? "morfológico" : "inferido";
        // Risco: inferido sem apoio do léxico da trilha é o topo.
        const risco = (tipo === "inferido" ? 2 : tipo === "morfológico" ? 1 : 0) + (noLexico ? 0 : 1);
        // REQ-004: `from` em TAG é autorização mais fraca que `from` em fact.text —
        // 66% das tags não aparecem no texto do fato, então são reivindicação nova,
        // não compressão dele. É o eixo de ordenação que importa agora.
        const kindTag = auditoria.get(nf);
        const origem = kindTag ? `tag:${kindTag}` : "fact.text";
        itens.push({ fato: b.fact_id, term: s.term, from: s.from, risco, tipo, origem });
      }
    }
    const peso = (o: string) => (o === "tag:interpretada" ? 0 : o === "tag:truncada" ? 1 : o === "tag:literal" ? 2 : 3);
    itens.sort((a, b) => peso(a.origem) - peso(b.origem) || b.risco - a.risco || a.fato.localeCompare(b.fato));
    const mecanicos = master.bullets.reduce(
      (n, b) => n + b.synonyms.filter((s) => normalizeForCompare(s.term) === normalizeForCompare(s.from)).length, 0);
    const bloco = (r: number) => itens.filter((i) => i.risco === r);
    const md = [
      `# Revisão de sinônimos — trilha ${track}`, "",
      "**Arquivo DERIVADO.** Regere com `npx tsx src/cli/master.ts review " + track + "`.", "",
      `**${mecanicos} sinônimos mecânicos** (\`from\` é a própria palavra do fato) estão FORA desta`,
      "lista. O risco deles é o mesmo de já ter aceito o fato — assinar em bloco é legítimo.", "",
      `**${itens.length} sinônimos autorais**, ordenados por risco decrescente. O risco combina a`,
      "distância do `from` (inferido > morfológico > derivado) com o apoio do léxico da trilha:",
      "termo que você já declarou como seu em `tracks.yaml` é menos arriscado que um que eu inventei.", "",
      ...["tag:interpretada", "tag:truncada", "tag:literal", "fact.text"].flatMap((o) => {
        const g = itens.filter((i) => i.origem === o);
        if (!g.length) return [];
        const rot: Record<string, string> = {
          "tag:interpretada": "`from` em tag INTERPRETADA — a tag não existe no texto do fato (REQ-004)",
          "tag:truncada": "`from` em tag TRUNCADA — a tag descartou um qualificador do fato",
          "tag:literal": "`from` em tag literal — a tag aparece íntegra no texto",
          "fact.text": "`from` no TEXTO do fato — autorização mais forte",
        };
        return [`## ${rot[o]} (${g.length})`, "", "| fato | sinônimo | autorizado por | inferência | risco |", "|---|---|---|---|---:|",
          ...g.map((i) => `| \`${i.fato}\` | **${i.term}** | \`${i.from}\` | ${i.tipo} | ${i.risco} |`), ""];
      }),
    ].join("\n");
    const dest = join(PROJECT_ROOT, "profile", `review-${track}.md`);
    writeFileSync(dest, md, "utf-8");
    console.log(`${mecanicos} mecânicos (assináveis em bloco) · ${itens.length} autorais → ${dest}`);
    for (const r of [3, 2, 1, 0]) console.log(`  risco ${r}: ${bloco(r).length}`);
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
