/**
 * dashboard — regenera o painel estático e (opcionalmente) abre no browser.
 *
 *   npx tsx src/cli/dashboard.ts [--open]
 */
import { execFileSync } from "node:child_process";
import { buildDashboard } from "../dashboard/build.js";

const path = buildDashboard();
console.log(`painel gerado: ${path}`);
if (process.argv.includes("--open")) {
  execFileSync("open", [path]);
}
