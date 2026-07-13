/**
 * schedule — liga/desliga a busca automática via launchd (macOS).
 *
 *   npx tsx src/cli/schedule.ts on|off|status
 *
 * Dupla segurança: o plist só existe com "on", e o search --auto ainda
 * checa o flag auto_search no config.yaml antes de rodar.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { getDb } from "../db/client.js";
import { loadConfig, CONFIG_PATH } from "../core/config.js";
import { installSchedule, removeSchedule, scheduleLoaded, describeSchedule, PLIST_PATH, LAUNCHD_LABEL } from "../local/schedule-ctl.js";

const cmd = process.argv[2];
if (!cmd || !["on", "off", "status"].includes(cmd)) {
  console.error("uso: schedule on|off|status");
  process.exit(1);
}

function setConfigFlag(on: boolean): void {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const updated = raw.replace(/^auto_search:\s*(on|off|true|false).*$/m, `auto_search: ${on ? "on" : "off"}`);
  writeFileSync(CONFIG_PATH, updated, "utf-8");
}

if (cmd === "on") {
  const config = loadConfig();
  installSchedule(config);
  setConfigFlag(true);
  console.log(`busca automática LIGADA — ${describeSchedule(config)}`);
  console.log(`plist: ${PLIST_PATH}`);
  console.log(`teste manual: launchctl kickstart gui/$(id -u)/${LAUNCHD_LABEL}`);
} else if (cmd === "off") {
  removeSchedule();
  setConfigFlag(false);
  console.log("busca automática DESLIGADA (plist removido e flag off).");
} else {
  const config = loadConfig();
  console.log(`config auto_search: ${config.auto_search ? "on" : "off"} (${describeSchedule(config)})`);
  console.log(`plist instalado: ${existsSync(PLIST_PATH) ? "sim" : "não"}`);
  console.log(`launchd: ${scheduleLoaded() ? "carregado" : "não carregado"}`);
  const last = getDb()
    .prepare("SELECT started_at, mode FROM search_runs ORDER BY started_at DESC LIMIT 1")
    .get() as unknown as { started_at: string; mode: string } | undefined;
  if (last) {
    const ageH = Math.round((Date.now() - new Date(last.started_at).getTime()) / 3600_000);
    console.log(`última busca: há ${ageH}h (${last.mode})`);
  }
}
