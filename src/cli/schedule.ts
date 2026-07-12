/**
 * schedule — liga/desliga a busca automática diária via launchd (macOS).
 *
 *   npx tsx src/cli/schedule.ts on|off|status
 *
 * Dupla segurança: o plist só existe com "on", e o search --auto ainda
 * checa o flag auto_search no config.yaml antes de rodar.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { userInfo } from "node:os";

// HOME pode vir adulterado em ambientes sandboxed — o passwd é a fonte confiável.
const homedir = () => userInfo().homedir;
import { PROJECT_ROOT, getDb } from "../db/client.js";
import { loadConfig, CONFIG_PATH } from "../core/config.js";

const LABEL = "com.rafael.curriculos.autosearch";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const LOGS_DIR = join(PROJECT_ROOT, "logs");

const cmd = process.argv[2];
if (!cmd || !["on", "off", "status"].includes(cmd)) {
  console.error("uso: schedule on|off|status");
  process.exit(1);
}

const uid = execFileSync("id", ["-u"]).toString().trim();

function setConfigFlag(on: boolean): void {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const updated = raw.replace(/^auto_search:\s*(on|off|true|false).*$/m, `auto_search: ${on ? "on" : "off"}`);
  writeFileSync(CONFIG_PATH, updated, "utf-8");
}

function renderPlist(hour: number): string {
  const tsx = join(PROJECT_ROOT, "node_modules", ".bin", "tsx");
  const searchScript = join(PROJECT_ROOT, "src", "cli", "search.ts");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${tsx}</string>
    <string>${searchScript}</string>
    <string>--auto</string>
  </array>
  <key>WorkingDirectory</key><string>${PROJECT_ROOT}</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${join(LOGS_DIR, "autosearch.log")}</string>
  <key>StandardErrorPath</key><string>${join(LOGS_DIR, "autosearch.err.log")}</string>
</dict>
</plist>`;
}

if (cmd === "on") {
  const config = loadConfig();
  mkdirSync(LOGS_DIR, { recursive: true });
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(PLIST_PATH, renderPlist(config.auto_search_hour), "utf-8");
  try {
    execFileSync("launchctl", ["bootout", `gui/${uid}`, PLIST_PATH], { stdio: "ignore" });
  } catch {
    /* não estava carregado */
  }
  execFileSync("launchctl", ["bootstrap", `gui/${uid}`, PLIST_PATH]);
  setConfigFlag(true);
  console.log(`busca automática LIGADA — diariamente às ${config.auto_search_hour}:00`);
  console.log(`plist: ${PLIST_PATH}`);
  console.log(`teste manual: launchctl kickstart gui/${uid}/${LABEL}`);
} else if (cmd === "off") {
  try {
    execFileSync("launchctl", ["bootout", `gui/${uid}`, PLIST_PATH], { stdio: "ignore" });
  } catch {
    /* não estava carregado */
  }
  if (existsSync(PLIST_PATH)) rmSync(PLIST_PATH);
  setConfigFlag(false);
  console.log("busca automática DESLIGADA (plist removido e flag off).");
} else {
  const config = loadConfig();
  console.log(`config auto_search: ${config.auto_search ? "on" : "off"} (hora: ${config.auto_search_hour}:00)`);
  console.log(`plist instalado: ${existsSync(PLIST_PATH) ? "sim" : "não"}`);
  try {
    const out = execFileSync("launchctl", ["print", `gui/${uid}/${LABEL}`]).toString();
    const state = out.match(/state = (\w+)/)?.[1];
    console.log(`launchd: carregado (state=${state ?? "?"})`);
  } catch {
    console.log("launchd: não carregado");
  }
  const last = getDb()
    .prepare("SELECT started_at, mode FROM search_runs ORDER BY started_at DESC LIMIT 1")
    .get() as { started_at: string; mode: string } | undefined;
  if (last) {
    const ageH = Math.round((Date.now() - new Date(last.started_at).getTime()) / 3600_000);
    console.log(`última busca: há ${ageH}h (${last.mode})`);
  }
}
