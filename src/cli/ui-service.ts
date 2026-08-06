/**
 * ui-service — o servidor da UI como serviço da sessão do usuário (launchd).
 *
 *   npx tsx src/cli/ui-service.ts on|off|status
 *
 * "on" instala e sobe o LaunchAgent (inicia no login, reinicia se cair,
 * e — crucial — roda com acesso ao Keychain, que o pipeline de aprovação
 * precisa para o `claude -p`). "npm run ui" manual continua funcionando
 * para desenvolvimento, mas não deve ser iniciado de shells sandboxados.
 */
import {
  installUiAgent,
  removeUiAgent,
  uiAgentHealth,
  uiResponding,
  UI_PLIST_PATH,
  UI_LABEL,
} from "../local/ui-agent.js";
import { SERVICE_LOGS_DIR } from "../local/service-logs.js";

const URL = "http://localhost:4780";
const cmd = process.argv[2];
if (!cmd || !["on", "off", "status"].includes(cmd)) {
  console.error("uso: ui-service on|off|status");
  process.exit(1);
}

if (cmd === "off") {
  removeUiAgent();
  console.log("UI como serviço: DESLIGADA (plist removido). Para uso manual: npm run ui");
  process.exit(0);
}

if (cmd === "on") {
  installUiAgent();
  console.log(`plist: ${UI_PLIST_PATH}`);
  // Não basta instalar: o launchd aceita o job e ele pode morrer no boot em laço.
  // Confirmamos que a porta responde antes de dizer que está ligada.
  process.stdout.write("subindo");
  for (let i = 0; i < 10; i++) {
    if (await uiResponding()) {
      console.log(`\nUI como serviço: LIGADA — ${URL} (inicia no login, reinicia se cair)`);
      process.exit(0);
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 700));
  }
  console.log();
  reportarFalha();
  process.exit(1);
}

// status
const h = uiAgentHealth();
console.log(`plist:   ${h.plistPresent ? UI_PLIST_PATH : "AUSENTE — rode `on`"}`);
console.log(`launchd: ${h.loaded ? "carregado" : "não carregado"} (${UI_LABEL})`);
if (await uiResponding()) {
  console.log(`servidor: RESPONDENDO em ${URL}${h.pid ? `  (pid ${h.pid})` : ""}`);
} else {
  console.log("servidor: NÃO RESPONDE");
  reportarFalha();
  process.exit(1);
}

function reportarFalha(): void {
  const h = uiAgentHealth();
  if (h.runs != null && h.runs > 1 && h.pid == null) {
    console.log(`\n⚠️  o launchd tentou subir ${h.runs}× e o processo não fica de pé.`);
  }
  if (h.lastExit) console.log(`    última saída: ${h.lastExit}`);
  if (h.lastExit?.includes("78")) {
    // Sintoma característico: EX_CONFIG com stderr vazio = o launchd não
    // conseguiu nem abrir o arquivo de log. Ver src/local/service-logs.ts.
    console.log("    78 = EX_CONFIG: o launchd falhou ANTES do seu código rodar.");
    console.log("    Causa usual: ele não consegue abrir os arquivos de log (TCC do macOS).");
  }
  console.log(`\n    logs: ${SERVICE_LOGS_DIR}`);
  console.log(`    detalhe: launchctl print gui/$(id -u)/${UI_LABEL}`);
}
