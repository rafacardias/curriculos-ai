/**
 * linkedin-post — valida rascunhos de post do LinkedIn contra a Regra nº 1.
 *
 *   npx tsx src/cli/linkedin-post.ts validate <arquivo>
 *
 * Post não é currículo (prosa, não bullets), então não exige cobertura por
 * linha — só que toda citação [exp:id] usada aponte pra um fato real do
 * perfil mestre. Ver `validateCitations` em src/core/truthcheck.ts.
 *
 * Códigos de saída:
 *   1  arquivo não encontrado / uso inválido
 *   2  citação inexistente no perfil mestre
 */
import { readFileSync, existsSync } from "node:fs";
import { loadMasterProfile } from "../core/profile.js";
import { validateCitations } from "../core/truthcheck.js";

const [cmd, file] = process.argv.slice(2);

if (cmd !== "validate" || !file) {
  console.error(`uso: linkedin-post validate <arquivo>`);
  process.exit(1);
}

if (!existsSync(file)) {
  console.error(`arquivo não encontrado: ${file}`);
  process.exit(1);
}

const text = readFileSync(file, "utf-8");
const profile = loadMasterProfile();
const { citations, invalid } = validateCitations(text, profile);

if (invalid.length > 0) {
  console.error(`citação inexistente no perfil mestre: ${invalid.join(", ")}`);
  process.exit(2);
}

console.log(`validate OK: ${citations.length} fato(s) citado(s)`);
