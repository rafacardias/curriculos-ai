/**
 * Cliente REST mínimo da Gmail API — só os endpoints que `inbox ingest` usa.
 * Sem `googleapis` (SDK gigante pra 5 chamadas HTTP) — mesmo espírito dos
 * outros adapters (fetch cru + timeout, ver `adapters/types.ts`).
 *
 * Escopo mínimo: `gmail.readonly`. Nunca escreve, nunca marca como lido,
 * nunca importa de `src/cli/` — pacote portável (CLAUDE.md).
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT_MS = 15000;

export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface AccessToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

async function postForm(url: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail OAuth HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function getAuthed(url: string, accessToken: string): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail API HTTP ${res.status} em ${url}: ${JSON.stringify(body)}`);
  return body;
}

/** Troca o `code` da tela de consentimento por access+refresh token (fluxo installed-app/loopback). */
export async function exchangeCodeForTokens(
  cfg: GmailOAuthConfig,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const body = await postForm(TOKEN_URL, {
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!body.refresh_token) {
    throw new Error(
      "Google não devolveu refresh_token — rode a autorização de novo (o app já tinha sido " +
        "autorizado antes; revogue o acesso em myaccount.google.com/permissions e repita)."
    );
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

/** Renova o access token a partir do refresh token salvo. Chamado a cada `inbox ingest`. */
export async function refreshAccessToken(cfg: GmailOAuthConfig, refreshToken: string): Promise<AccessToken> {
  const body = await postForm(TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  return { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
}

export interface GmailHistoryPage {
  historyId: string;
  addedMessageIds: string[];
  nextPageToken: string | null;
}

/** `history.list` — poll incremental a partir do historyId salvo em `inbox_state`. */
export async function listHistory(
  accessToken: string,
  startHistoryId: string,
  pageToken?: string
): Promise<GmailHistoryPage> {
  const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded" });
  if (pageToken) params.set("pageToken", pageToken);
  const body = await getAuthed(`${GMAIL_API}/history?${params}`, accessToken);
  const ids = new Set<string>();
  for (const h of body.history ?? []) {
    for (const m of h.messagesAdded ?? []) {
      if (m.message?.id) ids.add(m.message.id);
    }
  }
  return {
    historyId: body.historyId ?? startHistoryId,
    addedMessageIds: [...ids],
    nextPageToken: body.nextPageToken ?? null,
  };
}

export interface GmailMessageListPage {
  messageIds: string[];
  nextPageToken: string | null;
}

/** `messages.list` com query — só no backfill inicial (sem historyId salvo ainda). */
export async function listMessagesByQuery(
  accessToken: string,
  query: string,
  pageToken?: string
): Promise<GmailMessageListPage> {
  const params = new URLSearchParams({ q: query, maxResults: "100" });
  if (pageToken) params.set("pageToken", pageToken);
  const body = await getAuthed(`${GMAIL_API}/messages?${params}`, accessToken);
  return {
    messageIds: (body.messages ?? []).map((m: { id: string }) => m.id),
    nextPageToken: body.nextPageToken ?? null,
  };
}

/** `profile.get` — historyId ATUAL, ponto de partida do primeiro poll incremental pós-backfill. */
export async function getCurrentHistoryId(accessToken: string): Promise<string> {
  const body = await getAuthed(`${GMAIL_API}/profile`, accessToken);
  return String(body.historyId);
}

export interface NormalizedGmailMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  fromAddress: string;
  fromDomain: string;
  subject: string;
  snippet: string | null;
  receivedAt: string; // ISO
}

/** `messages.get` (format=metadata) — só os headers From/Subject + snippet + internalDate. */
export async function getMessageMetadata(accessToken: string, messageId: string): Promise<NormalizedGmailMessage> {
  const params = new URLSearchParams({ format: "metadata" });
  params.append("metadataHeaders", "From");
  params.append("metadataHeaders", "Subject");
  const body = await getAuthed(`${GMAIL_API}/messages/${messageId}?${params}`, accessToken);
  const headers: Array<{ name: string; value: string }> = body.payload?.headers ?? [];
  const fromHeader = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
  const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "(sem assunto)";
  const { address, domain } = parseFromHeader(fromHeader);
  return {
    gmailMessageId: body.id,
    gmailThreadId: body.threadId,
    fromAddress: address,
    fromDomain: domain,
    subject,
    snippet: body.snippet ?? null,
    receivedAt: new Date(Number(body.internalDate)).toISOString(),
  };
}

/** Extrai endereço e domínio de um header `From: "Nome" <alguem@dominio.com>`. */
export function parseFromHeader(from: string): { address: string; domain: string } {
  const match = from.match(/<([^>]+)>/);
  const address = (match ? match[1]! : from).trim().toLowerCase();
  const domain = address.split("@")[1]?.replace(/^www\./, "") ?? "";
  return { address, domain };
}
