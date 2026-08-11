/**
 * `.env.local` mínimo — sem dependência nova (`dotenv` é overkill pra
 * KEY=VALUE simples). "Credenciais vivem exclusivamente em .env.local"
 * (CLAUDE.md) — hoje só o `inbox-watch` (OAuth do Gmail) precisa disto.
 */
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENV_LOCAL_PATH = join(REPO_ROOT, ".env.local");

/** Lê `.env.local` e injeta em `process.env` (nunca sobrescreve uma var já setada no ambiente). */
export function loadEnvLocal(): void {
  if (!existsSync(ENV_LOCAL_PATH)) return;
  const lines = readFileSync(ENV_LOCAL_PATH, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Grava/atualiza uma chave em `.env.local`, preservando as demais linhas. `chmod 600` — é credencial. */
export function setEnvLocal(key: string, value: string): void {
  let lines: string[] = existsSync(ENV_LOCAL_PATH) ? readFileSync(ENV_LOCAL_PATH, "utf-8").split("\n") : [];
  const idx = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
  const line = `${key}=${value}`;
  if (idx === -1) {
    if (lines.length && lines[lines.length - 1]!.trim() !== "") lines.push("");
    lines.push(line);
  } else {
    lines[idx] = line;
  }
  writeFileSync(ENV_LOCAL_PATH, lines.join("\n").replace(/\n+$/, "\n"), "utf-8");
  chmodSync(ENV_LOCAL_PATH, 0o600);
}
