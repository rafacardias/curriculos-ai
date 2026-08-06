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
import { copyFileSync, readdirSync, existsSync, rmSync, readFileSync } from "node:fs";
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
});
