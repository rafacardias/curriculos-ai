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
import { installUiAgent, removeUiAgent, uiAgentLoaded, UI_PLIST_PATH, UI_LABEL } from "../local/ui-agent.js";

const cmd = process.argv[2];
if (!cmd || !["on", "off", "status"].includes(cmd)) {
  console.error("uso: ui-service on|off|status");
  process.exit(1);
}

if (cmd === "on") {
  installUiAgent();
  console.log("UI como serviço: LIGADA — http://localhost:4780 (inicia no login, reinicia se cair)");
  console.log(`plist: ${UI_PLIST_PATH}`);
} else if (cmd === "off") {
  removeUiAgent();
  console.log("UI como serviço: DESLIGADA (plist removido). Para uso manual: npm run ui");
} else {
  console.log(`plist instalado: ${UI_PLIST_PATH}`);
  console.log(`launchd: ${uiAgentLoaded() ? "carregado" : "não carregado"} (${UI_LABEL})`);
}
