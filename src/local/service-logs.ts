import { join } from "node:path";
import { userInfo } from "node:os";

/**
 * Onde os LaunchAgents escrevem stdout/stderr.
 *
 * NÃO pode ser `PROJECT_ROOT/logs`, e o motivo não é estilo — é o TCC do macOS.
 * O launchd abre `StandardOutPath` e `StandardErrorPath` ELE MESMO, antes do
 * exec, e ele não tem Acesso Total ao Disco. Com o projeto em `~/Desktop`
 * (protegido por TCC junto de Documents e Downloads), essa abertura falha, o job
 * morre com `EX_CONFIG` (78) e — o pior sintoma — **não escreve nada**, porque o
 * que falhou foi justamente o arquivo de erro. Diagnosticado em 2026-08-06: 13
 * tentativas, 13 falhas, stderr com 0 bytes.
 *
 * O processo em si lê e escreve o projeto no Desktop sem problema. A restrição é
 * só do launchd, então basta tirar os DOIS arquivos de log de lá.
 *
 * `~/Library/Logs/` é o lugar canônico no macOS e não é protegido por TCC.
 * Os logs da aplicação (`logs/pipeline-*.log`) continuam no projeto — quem os
 * escreve é o processo, não o launchd.
 */
export const SERVICE_LOGS_DIR = join(userInfo().homedir, "Library", "Logs", "curriculos");
