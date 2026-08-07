/**
 * parse-response — quebra a resposta de uma LLM nos 4 arquivos, num diretório
 * ARBITRÁRIO.
 *
 * Existe separado do `kit ingest` por uma razão de segurança, não de estilo: o
 * `ingest` escreve no `kitDir` canônico da vaga. Para comparar vias de redação eu
 * preciso escrever num diretório de trabalho, senão a medição sobrescreve o kit
 * real que ela está tentando usar como controle.
 *
 * Usa o MESMO `parsePortableResponse` do ingest — inclusive a recusa de resposta
 * incompleta. Se divergir do ingest, a comparação não vale.
 *
 *   npx tsx scripts/parse-response.ts --in <arquivo> --out <dir>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parsePortableResponse } from "../src/core/portable-prompt.js";

const { values } = parseArgs({
  options: { in: { type: "string" }, out: { type: "string" } },
});

if (!values.in || !values.out) {
  console.error("uso: parse-response --in <arquivo> --out <dir>");
  process.exit(1);
}
if (!existsSync(values.in)) {
  console.error(`arquivo não encontrado: ${values.in}`);
  process.exit(1);
}

const EXPECTED = ["resume.md", "cover-letter.md", "answers.md", "outreach.md"];
const { files, missing } = parsePortableResponse(readFileSync(values.in, "utf-8"), EXPECTED);

if (missing.length) {
  const achei = Object.keys(files);
  console.error(`resposta incompleta — faltam: ${missing.join(", ")}`);
  console.error(`achei: ${achei.length ? achei.join(", ") : "nenhum bloco"}`);
  console.error("\nO delimitador tem que estar sozinho na linha, exatamente assim:");
  console.error("  ===== FILE: resume.md =====");
  process.exit(1);
}

mkdirSync(values.out, { recursive: true });
for (const nome of EXPECTED) {
  writeFileSync(join(values.out, nome), files[nome]!, "utf-8");
  console.log(`  ${nome}  ${files[nome]!.length} chars`);
}
