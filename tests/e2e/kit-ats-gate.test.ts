/**
 * Gates de ATS (exit 4) — e o fechamento do LIM-001.
 *
 * O LIM-001 dizia: "o smoke test não prova que o PDF tem camada de texto
 * extraível por um ATS; provar exigiria um parser, ou seja, uma dependência
 * nova". A limitação era real e ficou registrada por meses. Agora o parser
 * existe como **devDependency** (`unpdf`), usado só aqui e no gate — o runtime
 * de produção continua sem depender dele, que é o que a regra de zero-dep
 * protege de verdade.
 *
 * Este arquivo DEPENDE do Chrome: o exit 4 acontece depois do render. Os exits
 * 1, 2 e 3 acontecem antes e ficam em `truthcheck-exit2.test.ts`, que segue
 * rodando sem browser.
 */
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, readdirSync, existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, SANDBOX_ROOT, resetSandboxData, runCli } from "../helpers/sandbox.js";
import { insertJob } from "../../src/db/repo/jobs.js";
import { extractPdfText } from "../../src/render/pdf-text.js";
import { normalizeForCompare, significantLines } from "../../src/core/gates.js";
import { stripCitations } from "../../src/core/truthcheck.js";

const KIT_FIXTURES = join(REPO_ROOT, "tests/fixtures/kit");
let jobId: string;
let kitDir: string;

function useKit(resumeFixture: string): void {
  copyFileSync(join(KIT_FIXTURES, resumeFixture), join(kitDir, "resume.md"));
  for (const f of ["cover-letter.md", "answers.md", "outreach.md"]) {
    copyFileSync(join(KIT_FIXTURES, f), join(kitDir, f));
  }
}

before(() => {
  resetSandboxData();
  const sync = runCli("src/cli/ingest-profile.ts", ["sync"]);
  assert.equal(sync.status, 0, sync.stderr);

  jobId = insertJob({
    source: "gupy",
    url: "https://ficticia.gupy.io/job/ats",
    title: "Analista de QA Júnior",
    companyName: "Fictícia Tecnologia",
    location: "São Paulo, SP",
    remoteType: "remote",
    language: "pt",
    description: "Vaga de quality assurance com teste de regressão, automação de API e Playwright.",
  })!.id;

  assert.equal(runCli("src/cli/kit.ts", ["prepare", jobId]).status, 0);
  const dirs = readdirSync(join(SANDBOX_ROOT, "output")).filter((d) => d !== "_jd-snapshots");
  kitDir = join(SANDBOX_ROOT, "output", dirs[0]!);
});

beforeEach(() => rmSync(join(kitDir, "resume.pdf"), { force: true }));

describe("kit.ts finalize — gates de ATS (exit 4)", () => {
  it("tabela markdown no currículo → exit 4, e o PDF é REMOVIDO", () => {
    // O template do projeto é coluna única e auditado, mas o `marked` renderiza
    // tabela GFM: basta o LLM escrever uma e o ATS embaralha as células.
    useKit("resume.tabela.md");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);

    assert.equal(r.status, 4, `esperava exit 4, veio ${r.status}. stderr: ${r.stderr}`);
    assert.match(r.stderr, /GATES DE ATS FALHARAM/);
    assert.match(r.stderr, /<table>/);
    assert.equal(
      existsSync(join(kitDir, "resume.pdf")),
      false,
      "um PDF que o ATS não lê não pode ficar no kit — seria submetido por engano"
    );
  });

  it("IDEMPOTÊNCIA: exit 4 não queima o resume.md — rodar finalize de novo falha pelo MESMO motivo, não por citação sumida", () => {
    // Achado do code review: o strip de citação passou a gravar o .md limpo no
    // disco antes do render. Se o exit 4 (ATS) reprovasse depois disso, a
    // PRÓXIMA chamada de finalize (o harness roda em laço até passar) leria um
    // resume.md já sem [exp:...] e o truthcheck acusaria "bullet sem citação" —
    // culpando veracidade por uma falha de tabela/HTML. O fix adiou a gravação
    // pra depois de TODOS os gates passarem.
    useKit("resume.tabela.md");
    const primeira = runCli("src/cli/kit.ts", ["finalize", jobId]);
    assert.equal(primeira.status, 4, `1ª rodada: esperava exit 4, veio ${primeira.status}`);

    const md1 = readFileSync(join(kitDir, "resume.md"), "utf-8");
    assert.match(md1, /\[exp:/, "resume.md não pode perder a citação numa rodada que falhou");

    const segunda = runCli("src/cli/kit.ts", ["finalize", jobId]);
    assert.equal(
      segunda.status,
      4,
      `2ª rodada: esperava exit 4 de novo (mesmo motivo), veio ${segunda.status}. stderr: ${segunda.stderr}`
    );
    assert.doesNotMatch(segunda.stderr, /TRUTHCHECK FALHOU/, "não pode virar falha de veracidade");
    assert.match(segunda.stderr, /<table>/);

    const md2 = readFileSync(join(kitDir, "resume.md"), "utf-8");
    assert.equal(md1, md2, "resume.md não pode mudar entre duas tentativas que falham igual");
  });

  it("LIM-001 FECHADO: o PDF gerado devolve o texto do currículo quando extraído", async () => {
    useKit("resume.ok.md");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);
    assert.equal(r.status, 0, `finalize falhou: ${r.stderr}`);

    const pdfPath = join(kitDir, "resume.pdf");
    assert.ok(existsSync(pdfPath));

    // A prova que faltava: abrir o PDF com um parser de verdade e conferir que
    // cada linha significativa do markdown está lá. Antes disto o smoke test só
    // assertava header %PDF- e tamanho > 5 KB — o que um PDF de imagem também
    // satisfaz.
    const { text, pages } = await extractPdfText(pdfPath);
    assert.ok(pages >= 1);
    assert.ok(text.length > 200, `texto extraído curto demais (${text.length} chars)`);

    const md = stripCitations(readFileSync(join(kitDir, "resume.md"), "utf-8"));
    const haystack = normalizeForCompare(text);
    const faltando = significantLines(md).filter((l) => !haystack.includes(normalizeForCompare(l)));
    assert.deepEqual(faltando, [], "conteúdo do markdown que não sobreviveu até o PDF");
  });

  it("o coverage-report traz páginas e caracteres extraíveis — informação, não gate", () => {
    // Duas páginas é ruim para vaga de entrada e normal para sênior; o sistema não
    // sabe distinguir, então informa ao lado da cobertura em vez de reprovar.
    useKit("resume.ok.md");
    assert.equal(runCli("src/cli/kit.ts", ["finalize", jobId]).status, 0);

    const relatorio = readFileSync(join(kitDir, "coverage-report.md"), "utf-8");
    assert.match(relatorio, /\*\*PDF:\*\* \d+ página\(s\) · \d+ caracteres extraíveis/);
  });

  it("o parser ausente FALHA ALTO — nunca passa em silêncio", async () => {
    // Um gate que se desliga sozinho quando a ferramenta some é pior que gate
    // nenhum: cria a impressão de que foi verificado.
    await assert.rejects(() => extractPdfText(join(kitDir, "nao-existe.pdf")));
  });

  it("bullet com abertura passiva ('Responsável por') → exit 3, gate car_frase_fraca", () => {
    useKit("resume.weak-bullet.md");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);

    assert.equal(r.status, 3, `esperava exit 3, veio ${r.status}. stderr: ${r.stderr}`);
    assert.match(r.stderr, /GATES DE CONTEÚDO FALHARAM/);
    assert.match(r.stderr, /car_frase_fraca/);
    assert.match(r.stderr, /Responsável por manter/);
  });

  it("finalize bem-sucedido: nenhum [exp:...] sobrevive em NENHUM entregável, nem no cover-letter.pdf", async () => {
    // O bug real: stripCitations só limpava a variável usada no PDF do currículo.
    // resume.md ficava sujo no disco e cover-letter.md nunca passava pelo strip —
    // o cover-letter.pdf saía com a tag visível. Fixture da carta aqui inclui uma
    // citação de propósito, para provar que ela também é removida.
    useKit("resume.ok.md");
    writeFileSync(
      join(kitDir, "cover-letter.md"),
      "# Carta de Apresentação\n\nEstruturei a suíte de regressão do checkout [exp:exp-acme-qa.f1] " +
        "e reduzi o tempo de triagem de bug [exp:exp-acme-qa.f2].\n\nAna Teste\n",
      "utf-8"
    );

    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);
    assert.equal(r.status, 0, `finalize falhou: ${r.stderr}`);

    for (const nome of ["resume.md", "cover-letter.md", "answers.md", "outreach.md"]) {
      const conteudo = readFileSync(join(kitDir, nome), "utf-8");
      assert.doesNotMatch(conteudo, /\[exp:/, `${nome} ainda tem citação no disco`);
    }

    const coverPdf = await extractPdfText(join(kitDir, "cover-letter.pdf"));
    assert.doesNotMatch(coverPdf.text, /\[exp:/, "cover-letter.pdf vazou citação");

    const resumePdf = await extractPdfText(join(kitDir, "resume.pdf"));
    assert.doesNotMatch(resumePdf.text, /\[exp:/, "resume.pdf vazou citação");
  });
});
