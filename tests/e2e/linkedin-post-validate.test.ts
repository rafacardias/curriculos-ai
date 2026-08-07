/**
 * `linkedin-post.ts validate` — spawn do processo real, não a função extraída,
 * pelo mesmo motivo do tests/e2e/truthcheck-exit2.test.ts: o contrato que
 * importa é o exit code do CLI que a skill /linkedin-post realmente roda.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../helpers/sandbox.js";

const dir = mkdtempSync(join(tmpdir(), "linkedin-post-"));

function writeDraft(name: string, body: string): string {
  const file = join(dir, name);
  writeFileSync(file, body, "utf-8");
  return file;
}

describe("linkedin-post.ts validate", () => {
  it("exit 0 quando toda citação existe no perfil mestre", () => {
    const file = writeDraft("ok.md", "Aprendi construindo [exp:exp-acme-qa.f1] este ano.");
    const r = runCli("src/cli/linkedin-post.ts", ["validate", file]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /validate OK: 1 fato\(s\) citado\(s\)/);
  });

  it("exit 2 quando a citação não existe no perfil mestre", () => {
    const file = writeDraft("bad.md", "Um fato inventado [exp:fato-que-nao-existe].");
    const r = runCli("src/cli/linkedin-post.ts", ["validate", file]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /citação inexistente/);
  });

  it("exit 1 quando o arquivo não existe", () => {
    const r = runCli("src/cli/linkedin-post.ts", ["validate", join(dir, "nao-existe.md")]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /arquivo não encontrado/);
  });

  it("exit 1 em uso inválido (sem subcomando)", () => {
    const r = runCli("src/cli/linkedin-post.ts", []);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /uso:/);
  });
});
