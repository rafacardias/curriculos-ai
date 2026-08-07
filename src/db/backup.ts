/**
 * Backup antes de escrita em massa — pré-condição, não conveniência.
 *
 * Em 2026-08-07 um reparo de `preference_weights` estornou ~60 rejeições em vez
 * de 5, por causa de um `indexOf` devolvendo −1. O erro foi meu; o que tornou o
 * dano reversível foi o backup automático que o comando tinha feito segundos
 * antes. Sem ele, a única saída seria reconstruir a tabela à mão a partir dos
 * eventos — se os eventos bastassem.
 *
 * Por isso isto vira função compartilhada em vez de trecho copiado: qualquer
 * comando destrutivo novo tem UMA coisa óbvia para chamar, e a auditoria de
 * "quem faz backup" vira grep por um nome só.
 *
 * O `wal_checkpoint(TRUNCATE)` não é detalhe: sem ele parte dos dados vive no
 * `-wal` e o `.db` copiado sai incompleto — um backup que parece válido e não é.
 */
import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { getDb, DB_PATH, PROJECT_ROOT } from "./client.js";

export interface BackupInfo {
  path: string;
  sha256: string;
  bytes: number;
}

/**
 * Copia o banco inteiro para `db/backups/`, com o WAL já consolidado.
 * `label` entra no nome do arquivo para dizer o que estava prestes a acontecer.
 */
export function backupDb(label?: string): BackupInfo {
  getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const dir = join(PROJECT_ROOT, "db", "backups");
  mkdirSync(dir, { recursive: true });
  // ISO sem ':' — legal no APFS, mas ':' em nome de arquivo quebra ferramenta demais.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
  const sufixo = label ? `.${label.replace(/[^a-z0-9-]+/gi, "-")}` : "";
  const path = join(dir, `curriculos.${stamp}${sufixo}.db`);
  copyFileSync(DB_PATH, path);
  return {
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    bytes: statSync(path).size,
  };
}

/** Uma linha para o operador conferir depois: caminho, tamanho e hash. */
export function printBackup(b: BackupInfo): void {
  console.log(`backup: ${b.path.replace(PROJECT_ROOT + "/", "")}  ·  ${(b.bytes / 1048576).toFixed(1)} MB`);
  console.log(`sha256: ${b.sha256}\n`);
}
