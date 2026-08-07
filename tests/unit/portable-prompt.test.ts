/**
 * Caminho portátil — gerar o kit em qualquer LLM.
 *
 * O que este teste protege NÃO é a qualidade do texto (isso é julgamento), é a
 * fronteira: o parser não pode gravar arquivo pela metade, e a Regra nº 1
 * continua sendo garantida pelo `finalize`, não pelo redator.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePortableResponse, FILE_MARK } from "../../src/core/portable-prompt.js";

const ESPERADOS = ["resume.md", "cover-letter.md", "answers.md", "outreach.md"];

const respostaOk = `${FILE_MARK} resume.md =====
# Ana Teste
## Experiência
- Fez uma coisa [exp:f1]
${FILE_MARK} cover-letter.md =====
Prezados,
Tenho interesse.
${FILE_MARK} answers.md =====
**Pretensão?** [CONFIRMAR: não há fato]
${FILE_MARK} outreach.md =====
Oi, vi a vaga.
`;

describe("parsePortableResponse", () => {
  it("separa os quatro arquivos", () => {
    const { files, missing } = parsePortableResponse(respostaOk, ESPERADOS);
    assert.deepEqual(missing, []);
    assert.equal(Object.keys(files).length, 4);
    assert.match(files["resume.md"]!, /\[exp:f1\]/);
    assert.match(files["answers.md"]!, /\[CONFIRMAR:/);
  });

  it("ignora prosa antes do primeiro delimitador", () => {
    // Modelo de chat quase sempre escreve "Claro! Aqui estão os arquivos:".
    const { files, missing } = parsePortableResponse("Claro! Aqui estão:\n\n" + respostaOk, ESPERADOS);
    assert.deepEqual(missing, []);
    assert.doesNotMatch(files["resume.md"]!, /Claro/);
  });

  it("tolera cerca de markdown em volta", () => {
    const { missing } = parsePortableResponse("```markdown\n" + respostaOk + "\n```", ESPERADOS);
    assert.deepEqual(missing, []);
  });

  it("tolera espaçamento variável no delimitador", () => {
    const solto = respostaOk.replace(/=====\s*FILE:\s*/g, "=====   FILE:   ");
    assert.deepEqual(parsePortableResponse(solto, ESPERADOS).missing, []);
  });

  it("RECUSA resposta incompleta em vez de gravar 3 de 4", () => {
    // Gravar parcialmente empurraria o erro para o finalize, longe da causa —
    // e deixaria um kit meio velho, meio novo no disco.
    const semOutreach = respostaOk.slice(0, respostaOk.indexOf(`${FILE_MARK} outreach.md`));
    const { files, missing } = parsePortableResponse(semOutreach, ESPERADOS);
    assert.deepEqual(missing, ["outreach.md"]);
    assert.equal(Object.keys(files).length, 3, "os 3 achados ficam no objeto, mas quem chama recusa");
  });

  it("bloco vazio conta como ausente", () => {
    const vazio = respostaOk.replace(/(===== FILE: outreach\.md =====)[\s\S]*$/, "$1\n\n");
    assert.deepEqual(parsePortableResponse(vazio, ESPERADOS).missing, ["outreach.md"]);
  });

  it("texto sem nenhum delimitador não vira arquivo nenhum", () => {
    const { files, missing } = parsePortableResponse("Aqui está seu currículo:\n# Ana", ESPERADOS);
    assert.deepEqual(files, {});
    assert.deepEqual(missing, ESPERADOS);
  });
});
