/**
 * inbox — leitura read-only do Gmail (docs/roadmap.md → Onda 3, Fase A).
 *
 *   npx tsx src/cli/inbox.ts auth              # autorização OAuth (uma vez, salva refresh token)
 *   npx tsx src/cli/inbox.ts ingest             # busca e-mails, dry-run (não grava)
 *   npx tsx src/cli/inbox.ts ingest --commit    # grava em inbox_messages
 *
 * Escopo OAuth mínimo: `gmail.readonly`. Sem compose, sem modify — nunca marca
 * como lido, nunca escreve, nunca casa nem transiciona candidatura (isso é
 * medição do Bloco C, separada — scripts/measure-inbox-match.ts).
 */
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { parseArgs } from "node:util";
import { loadEnvLocal, setEnvLocal } from "../core/env.js";
import { exchangeCodeForTokens, type GmailOAuthConfig } from "../adapters/gmail.js";
import { runInboxIngest } from "../core/inbox-ingest.js";
import { getEarliestApplicationDate } from "../db/repo/applications.js";

const REDIRECT_PORT = 8721;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

loadEnvLocal();

const argv = process.argv.slice(2);
const [cmd] = argv;
const { values } = parseArgs({
  args: argv.slice(1),
  options: { commit: { type: "boolean", default: false } },
  allowPositionals: true,
});

if (cmd === "auth") {
  await runAuth();
} else if (cmd === "ingest") {
  await runIngest(values.commit);
} else {
  console.log(`inbox — leitura read-only do Gmail

  auth             autoriza o acesso ao Gmail (OAuth, uma vez só) — salva o refresh token em .env.local
  ingest           busca e-mails novos, dry-run (não grava)
  ingest --commit  grava em inbox_messages e avança o historyId`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────

function readOAuthConfig(): GmailOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function runAuth(): Promise<void> {
  const cfg = readOAuthConfig();
  if (!cfg) {
    console.log(`Faltam credenciais OAuth. Passos (uma vez só):

1. https://console.cloud.google.com/apis/credentials — crie um projeto (ou use um existente).
2. Ative a Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com
3. Tela de consentimento OAuth: tipo "Externo" está OK pra uso pessoal (seu e-mail como test user).
4. Credenciais → Criar credenciais → ID do cliente OAuth → tipo "App para Desktop".
   Esse tipo NÃO tem campo de redirect URI pra preencher — só "Aplicativo da Web" tem. O Google
   libera automaticamente qualquer redirect http://127.0.0.1:<porta> pra apps Desktop (fluxo
   loopback). Este comando escuta em ${REDIRECT_URI} sem precisar cadastrar nada.
5. Copie o Client ID e o Client Secret para .env.local na raiz do repo:

   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...

Depois rode "npx tsx src/cli/inbox.ts auth" de novo.`);
    process.exit(1);
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", cfg.clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log(`Abra esta URL e autorize o acesso (só leitura):\n\n${authUrl.toString()}\n`);
  if (process.platform === "darwin") exec(`open "${authUrl.toString()}"`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get("error");
      const authCode = url.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(err ? `<p>Erro: ${err}. Pode fechar esta aba.</p>` : "<p>Autorizado. Pode fechar esta aba.</p>");
      server.close();
      if (err) reject(new Error(err));
      else if (authCode) resolve(authCode);
      else reject(new Error("callback sem code nem error"));
    });
    server.listen(REDIRECT_PORT, "127.0.0.1");
  });

  const tokens = await exchangeCodeForTokens(cfg, code, REDIRECT_URI);
  setEnvLocal("GMAIL_REFRESH_TOKEN", tokens.refreshToken);
  console.log("\nAutorizado. Refresh token salvo em .env.local (GMAIL_REFRESH_TOKEN).");
  console.log('Rode "npx tsx src/cli/inbox.ts ingest" pra testar (dry-run).');
}

async function runIngest(commit: boolean): Promise<void> {
  const cfg = readOAuthConfig();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!cfg || !refreshToken) {
    console.error('Sem credenciais/refresh token. Rode "npx tsx src/cli/inbox.ts auth" primeiro.');
    process.exit(1);
  }

  const earliest = getEarliestApplicationDate();
  if (!earliest) {
    console.error("Nenhuma candidatura no banco — nada pra casar, backfill não tem janela.");
    process.exit(1);
  }
  const backfillSinceDate = earliest.slice(0, 10).replace(/-/g, "/");

  const result = await runInboxIngest({
    oauth: cfg,
    refreshToken,
    commit,
    backfillSinceDate,
  });

  console.log(commit ? "COMMIT — gravou em inbox_messages.\n" : "DRY-RUN — nada foi escrito.\n");
  console.log(`modo: ${result.mode}${result.mode === "backfill" ? ` (desde ${backfillSinceDate})` : ""}`);
  console.log(`mensagens vistas: ${result.messagesSeen}`);
  console.log(`${commit ? "gravadas" : "seriam gravadas"}: ${result.messagesInserted}`);
  console.log(`já ingeridas antes (dedup): ${result.messagesAlreadyIngested}`);
  if (result.newHistoryId) console.log(`historyId salvo: ${result.newHistoryId}`);
  if (result.errors.length) {
    console.log(`\n${result.errors.length} erro(s):`);
    for (const e of result.errors) console.log(`  - ${e}`);
  }
  if (!commit) console.log('\nPara aplicar de verdade: npx tsx src/cli/inbox.ts ingest --commit');
}
