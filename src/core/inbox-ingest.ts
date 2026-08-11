/**
 * Orquestração de `inbox ingest` (docs/roadmap.md → Onda 3, Fase A).
 *
 * Backfill (primeira rodada, sem `historyId` salvo em `inbox_state`): varre
 * `messages.list` com `after:<data>` cobrindo a candidatura mais antiga.
 * Incremental (rodadas seguintes): `history.list` a partir do `historyId`
 * salvo. `historyId` expirado (Gmail devolve 404 depois de ~7 dias parado)
 * força resync completo — volta pro modo backfill na mesma rodada.
 *
 * Dry-run por padrão: busca e normaliza tudo, mas só grava com `commit: true`
 * — mesma convenção de `watch run --commit` (src/cli/watch.ts).
 */
import {
  refreshAccessToken,
  listHistory,
  listMessagesByQuery,
  getCurrentHistoryId,
  getMessageMetadata,
  type GmailOAuthConfig,
} from "../adapters/gmail.js";
import { getInboxState, setInboxState, insertInboxMessage, inboxMessageExists } from "../db/repo/inbox.js";

export interface InboxIngestOptions {
  oauth: GmailOAuthConfig;
  refreshToken: string;
  commit: boolean;
  /** `YYYY/MM/DD` — início da janela de backfill na primeira rodada (sem historyId salvo). */
  backfillSinceDate: string;
}

export interface InboxIngestMessageOutcome {
  gmailMessageId: string;
  subject: string;
  fromDomain: string;
  alreadyIngested: boolean;
}

export interface InboxIngestResult {
  mode: "backfill" | "incremental";
  commit: boolean;
  messagesSeen: number;
  messagesInserted: number;
  messagesAlreadyIngested: number;
  newHistoryId: string | null;
  outcomes: InboxIngestMessageOutcome[];
  errors: string[];
}

const HISTORY_ID_STATE_KEY = "history_id";

export async function runInboxIngest(opts: InboxIngestOptions): Promise<InboxIngestResult> {
  const { accessToken } = await refreshAccessToken(opts.oauth, opts.refreshToken);
  const savedHistoryId = getInboxState(HISTORY_ID_STATE_KEY);

  let mode: "backfill" | "incremental" = savedHistoryId ? "incremental" : "backfill";
  let messageIds: string[] = [];

  if (mode === "incremental") {
    try {
      messageIds = await collectHistoryMessageIds(accessToken, savedHistoryId!);
    } catch (err) {
      if (String(err).includes("404")) {
        mode = "backfill"; // historyId expirado — resync completo
      } else {
        throw err;
      }
    }
  }

  if (mode === "backfill") {
    messageIds = await collectBackfillMessageIds(accessToken, opts.backfillSinceDate);
  }

  const outcomes: InboxIngestMessageOutcome[] = [];
  const errors: string[] = [];
  let inserted = 0;
  let alreadyIngested = 0;

  for (const id of messageIds) {
    try {
      const meta = await getMessageMetadata(accessToken, id);
      const existed = inboxMessageExists(meta.gmailMessageId);
      outcomes.push({
        gmailMessageId: meta.gmailMessageId,
        subject: meta.subject,
        fromDomain: meta.fromDomain,
        alreadyIngested: existed,
      });
      if (existed) {
        alreadyIngested++;
        continue;
      }
      if (opts.commit) {
        insertInboxMessage({
          gmailMessageId: meta.gmailMessageId,
          gmailThreadId: meta.gmailThreadId,
          fromAddress: meta.fromAddress,
          fromDomain: meta.fromDomain,
          subject: meta.subject,
          snippet: meta.snippet,
          receivedAt: meta.receivedAt,
        });
      }
      inserted++;
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let newHistoryId: string | null = null;
  if (opts.commit) {
    newHistoryId = await getCurrentHistoryId(accessToken);
    setInboxState(HISTORY_ID_STATE_KEY, newHistoryId);
  }

  return {
    mode,
    commit: opts.commit,
    messagesSeen: messageIds.length,
    messagesInserted: inserted,
    messagesAlreadyIngested: alreadyIngested,
    newHistoryId,
    outcomes,
    errors,
  };
}

async function collectHistoryMessageIds(accessToken: string, startHistoryId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await listHistory(accessToken, startHistoryId, pageToken);
    ids.push(...page.addedMessageIds);
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

async function collectBackfillMessageIds(accessToken: string, sinceDate: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  const query = `after:${sinceDate}`;
  do {
    const page = await listMessagesByQuery(accessToken, query, pageToken);
    ids.push(...page.messageIds);
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}
