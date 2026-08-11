import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import { runInboxIngest } from "../../src/core/inbox-ingest.js";
import { getInboxState, listInboxMessages } from "../../src/db/repo/inbox.js";

beforeEach(() => resetDb());
let stub: FetchStub;
afterEach(() => stub?.restore());

const OAUTH = { clientId: "id", clientSecret: "secret" };

function tokenRoute(): [RegExp, { body: string }] {
  return [/oauth2\.googleapis\.com\/token/, { body: JSON.stringify({ access_token: "at-123", expires_in: 3600 }) }];
}

function messageDetailRoute(id: string, from: string, subject: string, internalDate: string): [RegExp, { body: string }] {
  return [
    new RegExp(`gmail\\.googleapis\\.com/gmail/v1/users/me/messages/${id}\\?`),
    {
      body: JSON.stringify({
        id,
        threadId: `thread-${id}`,
        snippet: "snippet",
        internalDate,
        payload: { headers: [{ name: "From", value: from }, { name: "Subject", value: subject }] },
      }),
    },
  ];
}

describe("runInboxIngest — modo backfill (sem historyId salvo)", () => {
  it("dry-run: busca e classifica, mas não grava nada no banco", async () => {
    stub = installFetchStub([
      tokenRoute(),
      [/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\?/, { body: JSON.stringify({ messages: [{ id: "m1" }] }) }],
      messageDetailRoute("m1", "rh@empresa.com", "Sobre sua candidatura", "1735689600000"),
    ]);

    const result = await runInboxIngest({
      oauth: OAUTH,
      refreshToken: "rt",
      commit: false,
      backfillSinceDate: "2026/01/01",
    });

    assert.equal(result.mode, "backfill");
    assert.equal(result.commit, false);
    assert.equal(result.messagesSeen, 1);
    assert.equal(result.messagesInserted, 1);
    assert.equal(listInboxMessages().length, 0, "dry-run não grava");
    assert.equal(getInboxState("history_id"), undefined, "dry-run não avança o historyId");
  });

  it("--commit: grava as mensagens e salva o historyId atual", async () => {
    stub = installFetchStub([
      tokenRoute(),
      [/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\?/, { body: JSON.stringify({ messages: [{ id: "m1" }] }) }],
      messageDetailRoute("m1", '"RH" <rh@empresa.com.br>', "Sobre sua candidatura", "1735689600000"),
      [/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile/, { body: JSON.stringify({ historyId: 555 }) }],
    ]);

    const result = await runInboxIngest({
      oauth: OAUTH,
      refreshToken: "rt",
      commit: true,
      backfillSinceDate: "2026/01/01",
    });

    assert.equal(result.messagesInserted, 1);
    const rows = listInboxMessages();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.from_domain, "empresa.com.br");
    assert.equal(rows[0]!.application_id, null, "ingestão nunca casa nem transiciona — só captura");
    assert.equal(getInboxState("history_id"), "555");
  });
});

describe("runInboxIngest — modo incremental (historyId salvo)", () => {
  it("usa history.list em vez de messages.list quando já existe historyId salvo", async () => {
    const { setInboxState } = await import("../../src/db/repo/inbox.js");
    setInboxState("history_id", "100");

    stub = installFetchStub([
      tokenRoute(),
      [
        /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/history/,
        { body: JSON.stringify({ historyId: "200", history: [{ messagesAdded: [{ message: { id: "m2" } }] }] }) },
      ],
      messageDetailRoute("m2", "rh@outra.com", "Follow-up", "1735689600000"),
      [/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile/, { body: JSON.stringify({ historyId: 200 }) }],
    ]);

    const result = await runInboxIngest({
      oauth: OAUTH,
      refreshToken: "rt",
      commit: true,
      backfillSinceDate: "2026/01/01",
    });

    assert.equal(result.mode, "incremental");
    assert.equal(result.messagesInserted, 1);
    assert.ok(stub.calls.some((u) => u.includes("/history")));
    assert.ok(!stub.calls.some((u) => u.includes("/messages?")));
  });

  it("mensagem já ingerida antes não duplica (dedup por gmail_message_id)", async () => {
    const { setInboxState, insertInboxMessage } = await import("../../src/db/repo/inbox.js");
    setInboxState("history_id", "100");
    insertInboxMessage({
      gmailMessageId: "m2",
      gmailThreadId: "thread-m2",
      fromAddress: "rh@outra.com",
      fromDomain: "outra.com",
      subject: "Follow-up",
      snippet: null,
      receivedAt: "2025-01-01T00:00:00.000Z",
    });

    stub = installFetchStub([
      tokenRoute(),
      [
        /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/history/,
        { body: JSON.stringify({ historyId: "200", history: [{ messagesAdded: [{ message: { id: "m2" } }] }] }) },
      ],
      messageDetailRoute("m2", "rh@outra.com", "Follow-up", "1735689600000"),
      [/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile/, { body: JSON.stringify({ historyId: 200 }) }],
    ]);

    const result = await runInboxIngest({
      oauth: OAUTH,
      refreshToken: "rt",
      commit: true,
      backfillSinceDate: "2026/01/01",
    });

    assert.equal(result.messagesInserted, 0);
    assert.equal(result.messagesAlreadyIngested, 1);
    assert.equal(listInboxMessages().length, 1);
  });

  it("historyId expirado (404) cai pro backfill completo na mesma rodada", async () => {
    const { setInboxState } = await import("../../src/db/repo/inbox.js");
    setInboxState("history_id", "muito-antigo");

    stub = installFetchStub([
      tokenRoute(),
      [/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/history/, { body: JSON.stringify({ error: { code: 404 } }), status: 404 }],
      [/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\?/, { body: JSON.stringify({ messages: [{ id: "m3" }] }) }],
      messageDetailRoute("m3", "rh@resync.com", "Resync", "1735689600000"),
      [/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile/, { body: JSON.stringify({ historyId: 999 }) }],
    ]);

    const result = await runInboxIngest({
      oauth: OAUTH,
      refreshToken: "rt",
      commit: true,
      backfillSinceDate: "2026/01/01",
    });

    assert.equal(result.mode, "backfill");
    assert.equal(result.messagesInserted, 1);
  });
});
