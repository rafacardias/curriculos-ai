/**
 * Controle do agendamento da busca automática via launchd (macOS).
 * Módulo local-only (não faz parte do pacote portável core/adapters/submit):
 * usado pelo CLI schedule.ts e pelo endpoint /api/config do servidor.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { userInfo } from "node:os";
import { PROJECT_ROOT } from "../db/client.js";
import type { AppConfig } from "../core/config.js";

// HOME pode vir adulterado em ambientes sandboxed — o passwd é a fonte confiável.
const homedir = () => userInfo().homedir;

export const LAUNCHD_LABEL = "com.rafael.curriculos.autosearch";
export const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
const LOGS_DIR = join(PROJECT_ROOT, "logs");

const uid = () => execFileSync("id", ["-u"]).toString().trim();

function renderPlist(hour: number, days: number[]): string {
  const tsx = join(PROJECT_ROOT, "node_modules", ".bin", "tsx");
  const searchScript = join(PROJECT_ROOT, "src", "cli", "search.ts");
  const everyDay = days.length === 0 || days.length === 7;
  const interval = everyDay
    ? `<dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>0</integer></dict>`
    : `<array>
${days
  .map(
    (d) =>
      `    <dict><key>Weekday</key><integer>${d}</integer><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>0</integer></dict>`
  )
  .join("\n")}
  </array>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${tsx}</string>
    <string>${searchScript}</string>
    <string>--auto</string>
  </array>
  <key>WorkingDirectory</key><string>${PROJECT_ROOT}</string>
  <key>StartCalendarInterval</key>
  ${interval}
  <key>StandardOutPath</key><string>${join(LOGS_DIR, "autosearch.log")}</string>
  <key>StandardErrorPath</key><string>${join(LOGS_DIR, "autosearch.err.log")}</string>
</dict>
</plist>`;
}

function bootout(): void {
  try {
    execFileSync("launchctl", ["bootout", `gui/${uid()}`, PLIST_PATH], { stdio: "ignore" });
  } catch {
    /* não estava carregado */
  }
}

/** Instala/atualiza o LaunchAgent conforme o config (não altera o config.yaml). */
export function installSchedule(config: Pick<AppConfig, "auto_search_hour" | "auto_search_days">): void {
  mkdirSync(LOGS_DIR, { recursive: true });
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(PLIST_PATH, renderPlist(config.auto_search_hour, config.auto_search_days), "utf-8");
  bootout();
  execFileSync("launchctl", ["bootstrap", `gui/${uid()}`, PLIST_PATH]);
}

/** Remove o LaunchAgent (não altera o config.yaml). */
export function removeSchedule(): void {
  bootout();
  if (existsSync(PLIST_PATH)) rmSync(PLIST_PATH);
}

/** Sincroniza o launchd com o estado do config: instala se auto_search on, remove se off. */
export function applySchedule(config: Pick<AppConfig, "auto_search" | "auto_search_hour" | "auto_search_days">): void {
  if (config.auto_search) installSchedule(config);
  else removeSchedule();
}

export function scheduleLoaded(): boolean {
  try {
    execFileSync("launchctl", ["print", `gui/${uid()}/${LAUNCHD_LABEL}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export const DAY_NAMES_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function describeSchedule(config: Pick<AppConfig, "auto_search_hour" | "auto_search_days">): string {
  const days = config.auto_search_days;
  const when = days.length === 0 || days.length === 7 ? "diariamente" : days.map((d) => DAY_NAMES_PT[d]).join("/");
  return `${when} às ${config.auto_search_hour}:00`;
}
