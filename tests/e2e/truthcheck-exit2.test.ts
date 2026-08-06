/**
 * REQUISITO (c) da Onda 0 — prova de comportamento REAL, não de mock.
 *
 * O README vende "o build falha mecanicamente se a citação não existir". Esse
 * contrato é um EXIT CODE, e só o processo de verdade o produz. Por isso aqui
 * damos spawn no `kit.ts finalize` e assertamos o código de saída — em vez de
 * extrair a função e testá-la, o que provaria outra coisa.
 *
 * Bônus: os exits 1, 2 e 3 acontecem ANTES do render de PDF, então este arquivo
 * não depende do Chrome. O exit 4 (gates de ATS) depende, e por isso mora em
 * tests/e2e/kit-ats-gate.test.ts.
 *
 * O valor destes testes é a ESPECIFICIDADE: cada código prova uma coisa
 * diferente, e um gate novo não pode canibalizar o código de outro.
 *   1 resume.md ausente · 2 truthcheck · 3 conteúdo · 4 ATS
 */
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, readdirSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, SANDBOX_ROOT, resetSandboxData, runCli } from "../helpers/sandbox.js";
import { insertJob } from "../../src/db/repo/jobs.js";

const KIT_FIXTURES = join(REPO_ROOT, "tests/fixtures/kit");
let jobId: string;
let kitDir: string;

/** Copia uma fixture de currículo para o kit como resume.md. */
function useResume(fixture: string): void {
  copyFileSync(join(KIT_FIXTURES, fixture), join(kitDir, "resume.md"));
}

/** Copia os outros três entregáveis, que o finalize passou a cobrar. */
function useDeliverables(answers = "answers.md"): void {
  for (const [fixture, alvo] of [
    ["cover-letter.md", "cover-letter.md"],
    [answers, "answers.md"],
    ["outreach.md", "outreach.md"],
  ] as const) {
    copyFileSync(join(KIT_FIXTURES, fixture), join(kitDir, alvo));
  }
}

before(() => {
  resetSandboxData();
  const sync = runCli("src/cli/ingest-profile.ts", ["sync"]);
  assert.equal(sync.status, 0, sync.stderr);

  jobId = insertJob({
    source: "gupy",
    url: "https://ficticia.gupy.io/job/exit2",
    title: "Analista de QA Júnior",
    companyName: "Fictícia Tecnologia",
    location: "São Paulo, SP",
    remoteType: "remote",
    language: "pt",
    description: "Vaga de quality assurance com teste de regressão, automação de API e Playwright.",
  })!.id;

  // prepare cria o diretório do kit — descobrimos o caminho lendo output/,
  // nunca replicando a lógica de slug do kit.ts.
  const prep = runCli("src/cli/kit.ts", ["prepare", jobId]);
  assert.equal(prep.status, 0, prep.stderr);

  const dirs = readdirSync(join(SANDBOX_ROOT, "output")).filter((d) => d !== "_jd-snapshots");
  assert.equal(dirs.length, 1, `esperava 1 kit, achei: ${dirs.join(", ")}`);
  kitDir = join(SANDBOX_ROOT, "output", dirs[0]!);
});

beforeEach(() => {
  rmSync(join(kitDir, "resume.pdf"), { force: true });
  rmSync(join(kitDir, "coverage-report.md"), { force: true });
  useResume("resume.ok.md");
  useDeliverables(); // estado limpo: só o que o teste alterar deve falhar
});

describe("kit.ts finalize — exit code do guardrail de veracidade", () => {
  it("citação a fato inexistente → exit 2, e NENHUM PDF é gerado", () => {
    useResume("resume.bad-citation.md");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);

    assert.equal(r.status, 2, `esperava exit 2, veio ${r.status}. stderr: ${r.stderr}`);
    assert.match(r.stderr, /TRUTHCHECK FALHOU/);
    assert.match(r.stderr, /citação inexistente: \[exp:fato-que-nao-existe\]/);
    assert.equal(existsSync(join(kitDir, "resume.pdf")), false, "o PDF não pode sair com citação falsa");
    assert.equal(existsSync(join(kitDir, "coverage-report.md")), false);
  });

  it("bullet sem citação (direto sob '## Experiência') → exit 2", () => {
    useResume("resume.uncited-direct.md");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);

    assert.equal(r.status, 2, `esperava exit 2, veio ${r.status}. stderr: ${r.stderr}`);
    assert.match(r.stderr, /bullet sem citação/);
  });

  it("BUG-005 CORRIGIDO: bullet sem citação sob '### Cargo — Empresa' → exit 2", () => {
    // Este é o formato que a skill /gerar realmente produz (SKILL.md:52). Antes da
    // correção o guardrail não olhava esses bullets e o PDF saía normalmente.
    useResume("resume.uncited-bullet.md");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);

    assert.equal(r.status, 2, `esperava exit 2, veio ${r.status}. stderr: ${r.stderr}`);
    assert.match(r.stderr, /bullet sem citação/);
    assert.equal(existsSync(join(kitDir, "resume.pdf")), false, "o PDF não pode sair");
  });

  it("resume.md ausente → exit 1, provando que o 2 é específico do truthcheck", () => {
    rmSync(join(kitDir, "resume.md"), { force: true });
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);

    assert.equal(r.status, 1, `esperava exit 1, veio ${r.status}`);
    assert.match(r.stderr, /resume\.md não encontrado/);
  });

  it("currículo com citações válidas não é barrado pelo truthcheck", () => {
    useResume("resume.ok.md");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);
    assert.notEqual(r.status, 2, `truthcheck barrou um currículo válido. stderr: ${r.stderr}`);
  });
});

describe("kit.ts finalize — gates de conteúdo (exit 3)", () => {
  it("[CONFIRMAR: ...] sobrevivente no answers.md → exit 3", () => {
    // Defeito REAL, não hipotético: o único kit em output/ tinha dois destes
    // vivos, um pedindo pretensão salarial. Sem este gate ele iria no formulário.
    useDeliverables("answers.confirmar.md");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);

    assert.equal(r.status, 3, `esperava exit 3, veio ${r.status}. stderr: ${r.stderr}`);
    assert.match(r.stderr, /GATES DE CONTEÚDO FALHARAM/);
    assert.match(r.stderr, /answers\.md:4/);
    assert.equal(existsSync(join(kitDir, "resume.pdf")), false, "não pode render PDF de kit reprovado");
  });

  it("entregável ausente → exit 3, com o nome do arquivo", () => {
    rmSync(join(kitDir, "outreach.md"), { force: true });
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);

    assert.equal(r.status, 3, `esperava exit 3, veio ${r.status}. stderr: ${r.stderr}`);
    assert.match(r.stderr, /outreach\.md\s+— ausente/);
  });

  it("entregável vazio conta como ausente → exit 3", () => {
    writeFileSync(join(kitDir, "answers.md"), "\n   \n", "utf-8");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);

    assert.equal(r.status, 3);
    assert.match(r.stderr, /answers\.md\s+— vazio/);
  });

  it("o truthcheck vem ANTES: currículo com citação falsa E placeholder sai 2, não 3", () => {
    // Ordem importa. Veracidade é a Regra nº 1; ela reprova primeiro, e o
    // operador vê o problema mais grave em vez do mais superficial.
    useResume("resume.bad-citation.md");
    useDeliverables("answers.confirmar.md");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);

    assert.equal(r.status, 2, `esperava exit 2 (truthcheck tem precedência), veio ${r.status}`);
  });
});
