/**
 * LaunchAgent do servidor da UI (Blackbird Command).
 *
 * O servidor PRECISA rodar na sessão gráfica do usuário (launchd gui domain):
 * o pipeline de aprovação dispara `claude -p`, que lê credenciais do Keychain —
 * um processo iniciado por shell sandboxado (ex.: de dentro do Claude Code)
 * não tem acesso ao keychain e trava com o pop-up "Chaves Não Encontradas".
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { userInfo } from "node:os";
import { PROJECT_ROOT } from "../db/client.js";
import { SERVICE_LOGS_DIR } from "./service-logs.js";

const homedir = () => userInfo().homedir;

export const UI_LABEL = "com.rafael.curriculos.ui";
export const UI_PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${UI_LABEL}.plist`);
/** stdout/stderr dos LaunchAgents — fora do projeto por causa do TCC. Ver service-logs.ts. */
const LOGS_DIR = SERVICE_LOGS_DIR;

const uid = () => execFileSync("id", ["-u"]).toString().trim();

function renderPlist(): string {
  const tsx = join(PROJECT_ROOT, "node_modules", ".bin", "tsx");
  const serverScript = join(PROJECT_ROOT, "src", "server", "index.ts");
  // PATH explícito: launchd não carrega o profile do shell; claude e node precisam resolver
  const path = [join(homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].join(":");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${UI_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${tsx}</string>
    <string>${serverScript}</string>
  </array>
  <key>WorkingDirectory</key><string>${PROJECT_ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${path}</string>
    <key>HOME</key><string>${homedir()}</string>
    <key>CURRICULOS_SERVICE</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(LOGS_DIR, "ui.log")}</string>
  <key>StandardErrorPath</key><string>${join(LOGS_DIR, "ui.err.log")}</string>
</dict>
</plist>`;
}

function bootout(): void {
  try {
    execFileSync("launchctl", ["bootout", `gui/${uid()}`, UI_PLIST_PATH], { stdio: "ignore" });
  } catch {
    /* não estava carregado */
  }
}

export function installUiAgent(): void {
  mkdirSync(LOGS_DIR, { recursive: true });
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(UI_PLIST_PATH, renderPlist(), "utf-8");
  bootout();
  execFileSync("launchctl", ["bootstrap", `gui/${uid()}`, UI_PLIST_PATH]);
}

export function removeUiAgent(): void {
  bootout();
  if (existsSync(UI_PLIST_PATH)) rmSync(UI_PLIST_PATH);
}

export function uiAgentLoaded(): boolean {
  try {
    execFileSync("launchctl", ["print", `gui/${uid()}/${UI_LABEL}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export interface UiAgentHealth {
  plistPresent: boolean;
  loaded: boolean;
  /** PID quando o job está de pé; null se morreu ou nunca subiu. */
  pid: number | null;
  /** Último código de saída relatado pelo launchd, quando houve um. */
  lastExit: string | null;
  /** Quantas vezes o launchd tentou subir. Alto + sem pid = laço de falha. */
  runs: number | null;
}

/**
 * Saúde real do agente. `uiAgentLoaded()` só diz que o launchd CONHECE o job —
 * um job que morre no boot e é reiniciado em laço aparece como "carregado" e
 * responde nada. Foi exatamente esse relatório enganoso que escondeu 13 falhas
 * consecutivas por TCC em 2026-08-06 (ver service-logs.ts).
 */
export function uiAgentHealth(): UiAgentHealth {
  const health: UiAgentHealth = {
    plistPresent: existsSync(UI_PLIST_PATH),
    loaded: false,
    pid: null,
    lastExit: null,
    runs: null,
  };
  let out = "";
  try {
    out = execFileSync("launchctl", ["print", `gui/${uid()}/${UI_LABEL}`], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    health.loaded = true;
  } catch {
    return health;
  }
  const pid = /^\s*pid\s*=\s*(\d+)/m.exec(out);
  if (pid) health.pid = Number(pid[1]);
  const exit = /^\s*last exit code\s*=\s*(.+)$/m.exec(out);
  if (exit) health.lastExit = exit[1]!.trim();
  const runs = /^\s*runs\s*=\s*(\d+)/m.exec(out);
  if (runs) health.runs = Number(runs[1]);
  return health;
}

/** A UI está de fato respondendo na porta? É a única pergunta que importa. */
export async function uiResponding(port = 4780, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}
