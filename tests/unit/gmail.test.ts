/**
 * Cliente REST da Gmail API (src/adapters/gmail.ts). Fetch cru stubado —
 * mesmo padrão de tests/helpers/net.ts (kill-switch: URL sem rota registrada
 * derruba o teste em vez de ir à rede real).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import {
  exchangeCodeForTokens,
  refreshAccessToken,
  listHistory,
  listMessagesByQuery,
  getCurrentHistoryId,
  getMessageMetadata,
  parseFromHeader,
} from "../../src/adapters/gmail.js";

let stub: FetchStub;
afterEach(() => stub?.restore());

describe("parseFromHeader", () => {
  it("extrai endereço e domínio de um header com nome de exibição", () => {
    const { address, domain } = parseFromHeader('"Recrutamento Empresa" <rh@empresa.com.br>');
    assert.equal(address, "rh@empresa.com.br");
    assert.equal(domain, "empresa.com.br");
  });

  it("header sem <> (só o e-mail cru)", () => {
    const { address, domain } = parseFromHeader("rh@empresa.com");
    assert.equal(address, "rh@empresa.com");
    assert.equal(domain, "empresa.com");
  });

  it("normaliza maiúsculas e www.", () => {
    const { domain } = parseFromHeader("<RH@WWW.Empresa.COM>");
    assert.equal(domain, "empresa.com");
  });
});

describe("exchangeCodeForTokens", () => {
  it("troca code por access+refresh token", async () => {
    stub = installFetchStub([
      [
        /oauth2\.googleapis\.com\/token/,
        {
          contentType: "application/json",
          body: JSON.stringify({ access_token: "at-123", refresh_token: "rt-456", expires_in: 3600 }),
        },
      ],
    ]);
    const result = await exchangeCodeForTokens(
      { clientId: "id", clientSecret: "secret" },
      "auth-code",
      "http://127.0.0.1:8721/callback"
    );
    assert.equal(result.accessToken, "at-123");
    assert.equal(result.refreshToken, "rt-456");
    assert.ok(result.expiresAt > Date.now());
  });

  it("sem refresh_token na resposta: erro explícito (Google só devolve na primeira autorização)", async () => {
    stub = installFetchStub([
      [/oauth2\.googleapis\.com\/token/, { body: JSON.stringify({ access_token: "at-123", expires_in: 3600 }) }],
    ]);
    await assert.rejects(
      () => exchangeCodeForTokens({ clientId: "id", clientSecret: "secret" }, "code", "http://x"),
      /refresh_token/
    );
  });
});

describe("refreshAccessToken", () => {
  it("renova o access token a partir do refresh token salvo", async () => {
    stub = installFetchStub([
      [/oauth2\.googleapis\.com\/token/, { body: JSON.stringify({ access_token: "at-new", expires_in: 3600 }) }],
    ]);
    const result = await refreshAccessToken({ clientId: "id", clientSecret: "secret" }, "rt-456");
    assert.equal(result.accessToken, "at-new");
  });
});

describe("listHistory", () => {
  it("agrega messagesAdded de todas as entradas de história em uma lista sem duplicata", async () => {
    stub = installFetchStub([
      [
        /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/history/,
        {
          body: JSON.stringify({
            historyId: "999",
            history: [
              { messagesAdded: [{ message: { id: "m1" } }, { message: { id: "m2" } }] },
              { messagesAdded: [{ message: { id: "m2" } }] }, // duplicata proposital
            ],
          }),
        },
      ],
    ]);
    const page = await listHistory("at-123", "500");
    assert.deepEqual(page.addedMessageIds.sort(), ["m1", "m2"]);
    assert.equal(page.historyId, "999");
    assert.equal(page.nextPageToken, null);
  });

  it("sem campo history (nada novo desde o historyId): lista vazia, historyId cai pro startHistoryId", async () => {
    stub = installFetchStub([[/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/history/, { body: JSON.stringify({}) }]]);
    const page = await listHistory("at-123", "500");
    assert.deepEqual(page.addedMessageIds, []);
    assert.equal(page.historyId, "500");
  });
});

describe("listMessagesByQuery", () => {
  it("lista ids de mensagem por query de busca (backfill inicial)", async () => {
    stub = installFetchStub([
      [
        /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\?/,
        { body: JSON.stringify({ messages: [{ id: "a" }, { id: "b" }], nextPageToken: "tok2" }) },
      ],
    ]);
    const page = await listMessagesByQuery("at-123", "after:2026/01/01");
    assert.deepEqual(page.messageIds, ["a", "b"]);
    assert.equal(page.nextPageToken, "tok2");
  });
});

describe("getCurrentHistoryId", () => {
  it("lê o historyId atual do profile", async () => {
    stub = installFetchStub([
      [/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile/, { body: JSON.stringify({ historyId: 12345 }) }],
    ]);
    const id = await getCurrentHistoryId("at-123");
    assert.equal(id, "12345");
  });
});

describe("getMessageMetadata", () => {
  it("normaliza headers From/Subject, snippet e internalDate", async () => {
    stub = installFetchStub([
      [
        /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/msg-1/,
        {
          body: JSON.stringify({
            id: "msg-1",
            threadId: "thread-1",
            snippet: "Olá, obrigado por se candidatar...",
            internalDate: "1735689600000", // 2025-01-01T00:00:00.000Z
            payload: {
              headers: [
                { name: "From", value: '"RH Empresa" <rh@empresa.com.br>' },
                { name: "Subject", value: "Sobre sua candidatura" },
              ],
            },
          }),
        },
      ],
    ]);
    const msg = await getMessageMetadata("at-123", "msg-1");
    assert.equal(msg.gmailMessageId, "msg-1");
    assert.equal(msg.gmailThreadId, "thread-1");
    assert.equal(msg.fromAddress, "rh@empresa.com.br");
    assert.equal(msg.fromDomain, "empresa.com.br");
    assert.equal(msg.subject, "Sobre sua candidatura");
    assert.equal(msg.snippet, "Olá, obrigado por se candidatar...");
    assert.equal(msg.receivedAt, "2025-01-01T00:00:00.000Z");
  });

  it("sem header Subject: usa placeholder honesto em vez de quebrar", async () => {
    stub = installFetchStub([
      [
        /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/msg-2/,
        {
          body: JSON.stringify({
            id: "msg-2",
            threadId: "thread-2",
            internalDate: "1735689600000",
            payload: { headers: [{ name: "From", value: "rh@empresa.com" }] },
          }),
        },
      ],
    ]);
    const msg = await getMessageMetadata("at-123", "msg-2");
    assert.equal(msg.subject, "(sem assunto)");
  });
});
