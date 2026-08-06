/**
 * Sandbox da suíte de testes.
 *
 * REGRA DURA: nenhum teste pode encostar em db/curriculos.db, config/config.yaml
 * ou profile/*.yaml reais. O isolamento vem de CURRICULOS_ROOT (ver src/db/client.ts),
 * setado pelo script `npm test`, e é VERIFICADO aqui no import — importar este módulo
 * é o que torna impossível esquecer.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_ROOT, DB_PATH, getDb } from "../../src/db/client.js";

/** Raiz do repositório — derivada da posição deste arquivo, nunca de env var. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Raiz de dados da sandbox (== PROJECT_ROOT quando CURRICULOS_ROOT está setado). */
export const SANDBOX_ROOT = PROJECT_ROOT;

export function assertSandboxed(): void {
  if (!process.env.CURRICULOS_ROOT) {
    throw new Error("SANDBOX: CURRICULOS_ROOT não está setado — rode a suíte via `npm test`.");
  }
  if (PROJECT_ROOT === REPO_ROOT) {
    throw new Error(`SANDBOX VIOLADA: PROJECT_ROOT aponta para o repositório (${PROJECT_ROOT}).`);
  }
  if (!PROJECT_ROOT.endsWith(".test-sandbox")) {
    throw new Error(
      `SANDBOX VIOLADA: raiz inesperada '${PROJECT_ROOT}' — o banco alvo seria '${DB_PATH}'.`
    );
  }
}

// Executa no import. Qualquer teste que importe este módulo está protegido.
assertSandboxed();

const TABLES = [
  "resume_versions",
  "submissions",
  "applications",
  "answer_bank",
  "events",
  "jobs",
  "companies",
  "profile_tracks",
  "candidate_facts",
  "preference_weights",
  "search_runs",
] as const;

/** Zera as tabelas de dados da sandbox (mantém o schema e o _migrations). */
export function resetDb(): void {
  const db = getDb(); // roda as migrations na sandbox se ainda não rodaram
  db.exec("PRAGMA foreign_keys = OFF");
  for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
  db.exec("PRAGMA foreign_keys = ON");
}

/** Zera o banco E os artefatos em disco (output/). Use no início de cada arquivo e2e. */
export function resetSandboxData(): void {
  resetDb();
  rmSync(join(SANDBOX_ROOT, "output"), { recursive: true, force: true });
}

/** Roda um CLI do projeto num processo separado, apontando para a sandbox. */
export function runCli(script: string, args: string[] = []): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, CURRICULOS_ROOT: SANDBOX_ROOT },
    encoding: "utf-8",
  });
}
