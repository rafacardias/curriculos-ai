import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runMatchCascade, normalizeDomain, type InboxMessageForMatch, type ApplicationForMatch } from "../../src/core/inbox-match.js";

describe("normalizeDomain", () => {
  it("minúsculo e sem www.", () => {
    assert.equal(normalizeDomain("WWW.Empresa.COM.br"), "empresa.com.br");
  });
  it("sem www. já fica igual", () => {
    assert.equal(normalizeDomain("empresa.com"), "empresa.com");
  });
});

describe("runMatchCascade", () => {
  const apps: ApplicationForMatch[] = [
    { applicationId: "app-a", companyDomain: "empresa-a.com" },
    { applicationId: "app-b", companyDomain: "empresa-b.com" },
    { applicationId: "app-c", companyDomain: null }, // empresa sem domínio conhecido
  ];

  it("Estágio 2: domínio do remetente bate com o domínio da empresa da candidatura", () => {
    const messages: InboxMessageForMatch[] = [
      { id: "m1", gmailThreadId: "t1", fromDomain: "empresa-a.com", receivedAt: "2026-08-01T10:00:00Z" },
    ];
    const [r] = runMatchCascade(messages, apps);
    assert.equal(r!.applicationId, "app-a");
    assert.equal(r!.method, "domain");
  });

  it("Estágio 1: segunda mensagem do MESMO thread herda o match, mesmo com domínio diferente (ex. recrutador pessoal)", () => {
    const messages: InboxMessageForMatch[] = [
      { id: "m1", gmailThreadId: "t1", fromDomain: "empresa-a.com", receivedAt: "2026-08-01T10:00:00Z" },
      { id: "m2", gmailThreadId: "t1", fromDomain: "gmail.com", receivedAt: "2026-08-02T10:00:00Z" },
    ];
    const [r1, r2] = runMatchCascade(messages, apps);
    assert.equal(r1!.method, "domain");
    assert.equal(r2!.applicationId, "app-a");
    assert.equal(r2!.method, "thread");
  });

  it("thread nunca visto antes e domínio sem candidata: fica sem match (no-domain-hit)", () => {
    const messages: InboxMessageForMatch[] = [
      { id: "m1", gmailThreadId: "t9", fromDomain: "gupy.io", receivedAt: "2026-08-01T10:00:00Z" },
    ];
    const [r] = runMatchCascade(messages, apps);
    assert.equal(r!.applicationId, null);
    assert.equal(r!.reason, "no-domain-hit");
  });

  it("domínio compartilhado por DUAS candidaturas fica ambíguo, não adivinha", () => {
    const ambiguous: ApplicationForMatch[] = [
      { applicationId: "app-x", companyDomain: "mesma-empresa.com" },
      { applicationId: "app-y", companyDomain: "mesma-empresa.com" },
    ];
    const messages: InboxMessageForMatch[] = [
      { id: "m1", gmailThreadId: "t1", fromDomain: "mesma-empresa.com", receivedAt: "2026-08-01T10:00:00Z" },
    ];
    const [r] = runMatchCascade(messages, ambiguous);
    assert.equal(r!.applicationId, null);
    assert.equal(r!.reason, "domain-ambiguous");
  });

  it("ordena por received_at antes de rodar a cascata — thread só herda de mensagem CRONOLOGICAMENTE anterior", () => {
    // Mesma entrada de m1/m2 acima, mas fora de ordem no array de input.
    const messages: InboxMessageForMatch[] = [
      { id: "m2", gmailThreadId: "t1", fromDomain: "gmail.com", receivedAt: "2026-08-02T10:00:00Z" },
      { id: "m1", gmailThreadId: "t1", fromDomain: "empresa-a.com", receivedAt: "2026-08-01T10:00:00Z" },
    ];
    const results = runMatchCascade(messages, apps);
    const r1 = results.find((r) => r.messageId === "m1")!;
    const r2 = results.find((r) => r.messageId === "m2")!;
    assert.equal(r1.method, "domain");
    assert.equal(r2.method, "thread");
    assert.equal(r2.applicationId, "app-a");
  });

  it("empresa sem domínio conhecido (companyDomain null) nunca gera match por domínio", () => {
    const messages: InboxMessageForMatch[] = [
      { id: "m1", gmailThreadId: "t1", fromDomain: "empresa-c.com", receivedAt: "2026-08-01T10:00:00Z" },
    ];
    const [r] = runMatchCascade(messages, apps);
    assert.equal(r!.applicationId, null);
  });
});
