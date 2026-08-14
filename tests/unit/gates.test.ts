/**
 * Gates de entregável. Cada um existe por causa de um defeito medido, não por
 * completude — os comentários dizem qual.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../helpers/sandbox.js";
import {
  checkPlaceholders,
  checkWeakBulletPhrasing,
  checkExpectedFiles,
  checkAtsHostileHtml,
  checkTextFidelity,
  checkReadingOrder,
  normalizeForCompare,
  significantLines,
  formatGateFailures,
} from "../../src/core/gates.js";
import { wrapAtsHtml } from "../../src/render/template.js";

describe("checkPlaceholders — [CONFIRMAR: ...] nunca chega ao envio", () => {
  it("pega o marcador e aponta arquivo e linha", () => {
    // Caso REAL: o único kit em output/ tem dois desses no answers.md, um deles
    // pedindo pretensão salarial. Sairia num formulário de candidatura.
    const r = checkPlaceholders({
      "answers.md": "P: Pretensão?\nR: [CONFIRMAR: pesquisar média de mercado]\n\nP: Outra?\nR: Sim.",
    });
    assert.ok(r);
    assert.equal(r.gate, "placeholder");
    assert.equal(r.detail.length, 1);
    assert.match(r.detail[0]!, /^answers\.md:2 /);
  });

  it("varre TODOS os entregáveis, não só o currículo", () => {
    const r = checkPlaceholders({
      "resume.md": "limpo",
      "cover-letter.md": "Prezados, [CONFIRMAR: nome do gestor]",
      "outreach.md": "Oi [CONFIRMAR: nome]",
    });
    assert.equal(r?.detail.length, 2);
  });

  it("é indiferente a maiúsculas e a marcadores multi-linha na mesma linha", () => {
    assert.ok(checkPlaceholders({ "a.md": "[confirmar: x] e [CONFIRMAR: y]" })?.detail.length === 2);
  });

  it("texto limpo passa", () => {
    assert.equal(checkPlaceholders({ "resume.md": "- Fiz X [exp:a.f1]" }), null);
  });

  it("colchete que não é o marcador não dispara", () => {
    assert.equal(checkPlaceholders({ "r.md": "- Fiz X [exp:a.f1] e [nota] e [CONFIRMADO: ok]" }), null);
  });
});

describe("checkWeakBulletPhrasing — a metodologia CAR sai do prompt e vira gate", () => {
  it("bloqueia 'responsável por' e devolve o bullet ofensor", () => {
    const r = checkWeakBulletPhrasing(["- Responsável por manter a suíte de regressão [exp:a.f1]"]);
    assert.ok(r);
    assert.equal(r.gate, "car_frase_fraca");
    assert.equal(r.detail.length, 1);
    assert.match(r.detail[0]!, /Respons[aá]vel por manter/);
  });

  it("é indiferente à capitalização e ao acento", () => {
    for (const b of ["- Ajudei em migrações de banco", "- ajudei na migração", "- Responsavel por QA"]) {
      assert.ok(checkWeakBulletPhrasing([b]), `deveria bloquear: ${b}`);
    }
  });

  it("pega as outras aberturas que a skill proíbe, uma linha de detalhe por bullet", () => {
    const r = checkWeakBulletPhrasing([
      "- Participei de reuniões de refinamento",
      "- Auxiliei o time de produto",
      "- Estruturei a suíte de regressão do checkout [exp:a.f1]",
    ]);
    assert.equal(r?.detail.length, 2);
  });

  it("bullet com verbo de ação forte passa", () => {
    const ok = [
      "- Estruturei a suíte de regressão manual do checkout, cobrindo 42 casos [exp:a.f1]",
      "- Reduzi o tempo de triagem de bug de 3 dias para 8 horas [exp:a.f2]",
    ];
    assert.equal(checkWeakBulletPhrasing(ok), null);
  });

  it("lista vazia passa — currículo sem seção de experiência não é defeito deste gate", () => {
    assert.equal(checkWeakBulletPhrasing([]), null);
    assert.equal(checkWeakBulletPhrasing([""]), null);
  });

  it("não dispara em palavra que só CONTÉM o termo proibido", () => {
    // `\b` na regex: "responsabilidade" e "coparticipei" não são a abertura passiva.
    assert.equal(
      checkWeakBulletPhrasing(["- Assumi a responsabilidade pelo pipeline de release [exp:a.f1]"]),
      null
    );
  });
});

describe("checkExpectedFiles — o contrato do bundle passa a ser cobrado", () => {
  const EXPECTED = ["resume.md", "cover-letter.md", "answers.md", "outreach.md"];

  it("acusa ausente e vazio separadamente", () => {
    const r = checkExpectedFiles(EXPECTED, {
      "resume.md": "conteúdo",
      "cover-letter.md": null,
      "answers.md": "   \n  ",
      "outreach.md": "conteúdo",
    });
    assert.ok(r);
    assert.match(r.detail.join("\n"), /cover-letter\.md\s+— ausente/);
    assert.match(r.detail.join("\n"), /answers\.md\s+— vazio/);
    assert.equal(r.detail.length, 2);
  });

  it("todos presentes e com conteúdo passa", () => {
    const todos = Object.fromEntries(EXPECTED.map((n) => [n, "x"]));
    assert.equal(checkExpectedFiles(EXPECTED, todos), null);
  });
});

describe("checkAtsHostileHtml", () => {
  it("o template real do projeto passa — ele é coluna única e auditado", () => {
    const html = wrapAtsHtml("# Nome\n\n## Experiência\n\n- Fiz X\n- Fiz Y\n", "t");
    assert.equal(checkAtsHostileHtml(html), null);
  });

  it("tabela markdown vira <table> e reprova", () => {
    // Este é o buraco real: o template não tem tabela, mas o `marked` renderiza
    // tabela GFM se o LLM escrever uma — e aí o ATS embaralha as células.
    const html = wrapAtsHtml("| a | b |\n|---|---|\n| 1 | 2 |\n", "t");
    assert.match(html, /<table/i, "pré-condição: marked realmente emite <table>");
    const r = checkAtsHostileHtml(html);
    assert.ok(r);
    assert.match(r.detail.join(), /<table>/);
  });

  it("imagem, coluna e posicionamento absoluto também reprovam", () => {
    for (const h of ['<img src="x">', "<style>p{column-count:2}</style>", "<div style='position: absolute'>"]) {
      assert.ok(checkAtsHostileHtml(h), `deveria reprovar: ${h}`);
    }
  });
});

describe("normalizeForCompare / significantLines", () => {
  it("remove acento, caixa e pontuação para comparar extrações diferentes", () => {
    assert.equal(normalizeForCompare("Automação, CI/CD — Node.js"), "automacao ci cd node js");
  });

  it("significantLines tira o marcador de markdown e descarta linha curta", () => {
    const l = significantLines("# Nome\n\n## Experiência Profissional\n- ok\n- Estruturei a suíte de regressão\n");
    assert.deepEqual(l, ["Experiência Profissional", "Estruturei a suíte de regressão"]);
  });
});

describe("checkTextFidelity — conteúdo não pode sumir no caminho do PDF", () => {
  const md = "## Experiência Profissional\n- Estruturei a suíte de regressão do checkout\n";

  it("passa quando o extraído contém tudo, mesmo com quebras diferentes", () => {
    const pdf = "EXPERIÊNCIA PROFISSIONAL\nEstruturei a suíte de\nregressão do checkout";
    assert.equal(checkTextFidelity(md, pdf, "pdf"), null);
  });

  it("reprova quando um bullet sumiu", () => {
    const r = checkTextFidelity(md, "EXPERIÊNCIA PROFISSIONAL", "pdf");
    assert.ok(r);
    assert.match(r.detail.join(), /sumiu: Estruturei a suíte/);
  });
});

describe("checkReadingOrder — sequência, não presença", () => {
  it("REGRESSÃO: palavra repetida antes da âncora não é falso positivo", () => {
    // Bug medido no kit real: o heading "CERTIFICAÇÕES" casava com a palavra
    // "certificações" citada num bullet lá em cima, e o gate acusava desordem
    // num documento perfeitamente ordenado. A correção é casar por
    // SUBSEQUÊNCIA, avançando o cursor até o fim da âncora anterior.
    const dom = "Tenho tres certificacoes ativas hoje\nFormacao academica completa\nCERTIFICACOES ATIVAS";
    const pdf = "Tenho tres certificacoes ativas hoje\nFormacao academica completa\nCERTIFICACOES ATIVAS";
    assert.equal(checkReadingOrder(dom, pdf), null);
  });

  it("documento embaralhado reprova, e diz que é DESORDEM, não perda", () => {
    const dom = "Primeira secao com texto longo\nSegunda secao com texto longo";
    const pdf = "Segunda secao com texto longo\nPrimeira secao com texto longo";
    const r = checkReadingOrder(dom, pdf);
    assert.ok(r);
    assert.equal(r.gate, "ordem_de_leitura");
    assert.match(r.detail.join(), /fora de ordem/);
    assert.doesNotMatch(r.detail.join(), /sumiu/);
  });

  it("conteúdo ausente é reportado como PERDA, não como desordem", () => {
    const r = checkReadingOrder("Primeira secao com texto longo\nSegunda secao com texto longo", "Primeira secao com texto longo");
    assert.ok(r);
    assert.match(r.detail.join(), /sumiu do PDF/);
    assert.doesNotMatch(r.detail.join(), /fora de ordem/);
  });

  it("o par innerText/PDF do render real do projeto casa em ordem", () => {
    // Sem browser: o innerText de um documento coluna única é o próprio texto
    // na ordem do DOM, então o markdown serve de proxy fiel aqui.
    const md = readFileSync(join(REPO_ROOT, "tests/fixtures/kit/resume.ok.md"), "utf-8");
    const semMarcadores = md.replace(/\s*\[exp:[^\]]+\]/g, "");
    assert.equal(checkReadingOrder(semMarcadores, semMarcadores), null);
  });
});

describe("formatGateFailures", () => {
  it("agrupa por gate e prefixa cada problema", () => {
    const s = formatGateFailures([{ gate: "placeholder", detail: ["a.md:1  [CONFIRMAR: x]"] }]);
    assert.match(s, /\[placeholder\]/);
    assert.match(s, /✗ a\.md:1/);
  });
});
