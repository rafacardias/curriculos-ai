import { ulid } from "ulid";
import { getDb, nowIso } from "../client.js";

export interface InboxMessageRow {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  from_address: string;
  from_domain: string;
  subject: string;
  snippet: string | null;
  received_at: string;
  application_id: string | null;
  match_method: string | null;
  match_confidence: number | null;
  classified_as: string | null;
  classifier: string | null;
  applied_transition: number;
  created_at: string;
}

export interface NewInboxMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  fromAddress: string;
  fromDomain: string;
  subject: string;
  snippet: string | null;
  receivedAt: string;
  applicationId?: string | null;
  matchMethod?: string | null;
  matchConfidence?: number | null;
}

/** Dedup por `gmail_message_id` (UNIQUE). Devolve null se a mensagem já foi ingerida antes. */
export function insertInboxMessage(msg: NewInboxMessage): InboxMessageRow | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM inbox_messages WHERE gmail_message_id = ?")
    .get(msg.gmailMessageId);
  if (existing) return null;

  const row: InboxMessageRow = {
    id: ulid(),
    gmail_message_id: msg.gmailMessageId,
    gmail_thread_id: msg.gmailThreadId,
    from_address: msg.fromAddress,
    from_domain: msg.fromDomain,
    subject: msg.subject,
    snippet: msg.snippet,
    received_at: msg.receivedAt,
    application_id: msg.applicationId ?? null,
    match_method: msg.matchMethod ?? null,
    match_confidence: msg.matchConfidence ?? null,
    classified_as: null,
    classifier: null,
    applied_transition: 0,
    created_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO inbox_messages
       (id, gmail_message_id, gmail_thread_id, from_address, from_domain, subject, snippet,
        received_at, application_id, match_method, match_confidence, classified_as, classifier,
        applied_transition, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.gmail_message_id,
    row.gmail_thread_id,
    row.from_address,
    row.from_domain,
    row.subject,
    row.snippet,
    row.received_at,
    row.application_id,
    row.match_method,
    row.match_confidence,
    row.classified_as,
    row.classifier,
    row.applied_transition,
    row.created_at
  );
  return row;
}

export function listInboxMessages(): InboxMessageRow[] {
  return getDb()
    .prepare("SELECT * FROM inbox_messages ORDER BY received_at ASC")
    .all() as unknown as InboxMessageRow[];
}

export function getInboxState(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM inbox_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setInboxState(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO inbox_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}
