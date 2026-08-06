/**
 * audit-past-kits — roda o truthcheck ATUAL contra todos os currículos já gerados
 * em output/, usando o perfil mestre real.
 *
 * Serve para responder, depois de qualquer mudança no guardrail de veracidade:
 * "algum kit que eu já submeti tem bullet sem lastro?".
 *
 *   npx tsx scripts/audit-past-kits.ts
 *
 * Só lê. Não corrige nada, não toca o banco, não reescreve kit.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "../src/db/client.js";
import { loadMasterProfile } from "../src/core/profile.js";
import { truthcheck } from "../src/core/truthcheck.js";

const OUTPUT_DIR = join(PROJECT_ROOT, "output");
if (!existsSync(OUTPUT_DIR)) {
  console.log("output/ não existe — nenhum kit gerado ainda.");
  process.exit(0);
}

const profile = loadMasterProfile();

interface Achado {
  kit: string;
  vaga: string;
  empresa: string;
  gerado: string;
  invalid: string[];
  uncited: string[];
}

const achados: Achado[] = [];
let analisados = 0;
let semResume = 0;

for (const dir of readdirSync(OUTPUT_DIR).sort()) {
  if (dir.startsWith("_")) continue; // _jd-snapshots
  const kitDir = join(OUTPUT_DIR, dir);
  if (!statSync(kitDir).isDirectory()) continue;

  const resumePath = join(kitDir, "resume.md");
  if (!existsSync(resumePath)) {
    semResume++;
    continue;
  }
  analisados++;

  const r = truthcheck(readFileSync(resumePath, "utf-8"), profile);
  if (r.ok) continue;

  let vaga = "(sem bundle.json)";
  let empresa = "?";
  const bundlePath = join(kitDir, "bundle.json");
  if (existsSync(bundlePath)) {
    try {
      const b = JSON.parse(readFileSync(bundlePath, "utf-8"));
      vaga = b.job?.title ?? vaga;
      empresa = b.job?.company ?? empresa;
    } catch {
      /* bundle ilegível — o diretório ainda é identificável pelo nome */
    }
  }

  achados.push({
    kit: dir,
    vaga,
    empresa,
    gerado: statSync(resumePath).mtime.toISOString().slice(0, 16).replace("T", " "),
    invalid: r.invalid,
    uncited: r.uncitedBullets,
  });
}

console.log(`Kits em output/: ${analisados} com resume.md${semResume ? ` (+${semResume} sem resume.md)` : ""}`);
console.log(`Perfil mestre: ${profile.identity.name} · ${profile.experiences.length} experiências\n`);

if (!achados.length) {
  console.log("✅ Nenhum currículo gerado reprova no truthcheck atual.");
  console.log("   Todo bullet de experiência dos kits existentes tem citação, e toda citação existe no perfil.");
  process.exit(0);
}

console.log(`⚠️  ${achados.length} de ${analisados} kit(s) reprovam no truthcheck atual:\n`);

for (const a of achados) {
  console.log(`── ${a.empresa} — ${a.vaga}`);
  console.log(`   kit: output/${a.kit}  ·  gerado em ${a.gerado}`);
  if (a.invalid.length) {
    console.log(`   citações a fatos INEXISTENTES (${a.invalid.length}):`);
    for (const id of a.invalid) console.log(`     ✗ [exp:${id}]`);
  }
  if (a.uncited.length) {
    console.log(`   bullets SEM citação (${a.uncited.length}) — sem lastro no perfil:`);
    for (const b of a.uncited) console.log(`     ✗ ${b}`);
  }
  console.log();
}

const totalUncited = achados.reduce((n, a) => n + a.uncited.length, 0);
const totalInvalid = achados.reduce((n, a) => n + a.invalid.length, 0);
console.log(`Total: ${totalInvalid} citação(ões) inválida(s), ${totalUncited} bullet(s) sem citação.`);
