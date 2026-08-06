/**
 * REQUISITO (c) da Onda 0 — prova de comportamento REAL, não de mock.
 *
 * O README vende "o build falha mecanicamente se a citação não existir". Esse
 * contrato é um EXIT CODE, e só o processo de verdade o produz. Por isso aqui
 * damos spawn no `kit.ts finalize` e assertamos o código de saída — em vez de
 * extrair a função e testá-la, o que provaria outra coisa.
 *
 * Bônus: o process.exit(2) acontece ANTES do render de PDF, então este arquivo
 * não depende do Chrome.
 */
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, readdirSync, existsSync, rmSync } from "node:fs";
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

  it("BUG-005 CONGELADO: bullet sem citação sob '### Cargo — Empresa' NÃO falha", () => {
    // A máquina de estado do truthcheck desliga em qualquer heading que não case
    // /experi[êe]ncia|experience/ — e "### <Cargo> — <Empresa>" é exatamente o
    // formato que a skill /gerar prescreve (SKILL.md:52). No formato canônico do
    // sistema, a metade "bullet sem citação" do guardrail nunca dispara.
    // Quando for corrigido, ESTE TESTE DEVE FALHAR.
    useResume("resume.uncited-bullet.md");
    const r = runCli("src/cli/kit.ts", ["finalize", jobId]);
    assert.notEqual(r.status, 2, "se deu 2, o BUG-005 foi corrigido — inverta o teste");
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
