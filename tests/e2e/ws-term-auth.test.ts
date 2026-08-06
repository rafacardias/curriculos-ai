/**
 * Prova ponta a ponta de que o /term recusa conexão não autorizada — com um
 * servidor WebSocket real e um cliente `ws` real, não com mock.
 *
 * O teste sobe um servidor com a MESMA lógica de autorização do
 * src/server/index.ts, mas sem PTY: o que precisa ser provado é que a recusa
 * acontece ANTES de qualquer shell nascer.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import "../helpers/sandbox.js";
import { isAuthorizedUpgrade, newSessionToken } from "../../src/server/ws-auth.js";

const TOKEN = newSessionToken();
let server: Server;
let port: number;
/** Quantas vezes um "PTY" teria sido criado. Precisa ficar em 1 no fim. */
let ptysSpawned = 0;

before(async () => {
  server = createServer();
  const wss = new WebSocketServer({ server, path: "/term" });

  wss.on("connection", (ws, req) => {
    const verdict = isAuthorizedUpgrade(req, TOKEN, port);
    if (!verdict.ok) {
      ws.close(verdict.code, verdict.reason);
      return; // nenhum PTY nasce
    }
    ptysSpawned++;
    ws.send("prompt$ ");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

after(() => server.close());

/** Conecta e devolve como a conexão terminou. */
function connect(opts: { token?: string; origin?: string }): Promise<
  { outcome: "open"; firstMessage: string } | { outcome: "closed"; code: number }
> {
  const qs = opts.token ? `?token=${encodeURIComponent(opts.token)}` : "";
  const ws = new WebSocket(`ws://127.0.0.1:${port}/term${qs}`, {
    headers: opts.origin ? { origin: opts.origin } : {},
  });
  return new Promise((resolve) => {
    ws.on("message", (d) => {
      ws.close();
      resolve({ outcome: "open", firstMessage: String(d) });
    });
    ws.on("close", (code) => resolve({ outcome: "closed", code }));
    ws.on("error", () => resolve({ outcome: "closed", code: 0 }));
  });
}

describe("/term — autorização do upgrade", () => {
  it("conexão sem token é rejeitada com 4401", async () => {
    const r = await connect({ origin: `http://localhost:${port}` });
    assert.equal(r.outcome, "closed");
    assert.equal(r.outcome === "closed" && r.code, 4401);
  });

  it("conexão de Origin estranha é rejeitada com 4403, mesmo com token válido", async () => {
    const r = await connect({ token: TOKEN, origin: "https://exemplo-malicioso.com" });
    assert.equal(r.outcome, "closed");
    assert.equal(r.outcome === "closed" && r.code, 4403);
  });

  it("conexão sem header Origin é rejeitada", async () => {
    const r = await connect({ token: TOKEN });
    assert.equal(r.outcome, "closed");
    assert.equal(r.outcome === "closed" && r.code, 4403);
  });

  it("token de uma sessão anterior é rejeitado", async () => {
    const r = await connect({ token: newSessionToken(), origin: `http://localhost:${port}` });
    assert.equal(r.outcome, "closed");
    assert.equal(r.outcome === "closed" && r.code, 4401);
  });

  it("Origin na allowlist + token correto conecta", async () => {
    const r = await connect({ token: TOKEN, origin: `http://127.0.0.1:${port}` });
    assert.equal(r.outcome, "open");
    assert.equal(r.outcome === "open" && r.firstMessage, "prompt$ ");
  });

  it("nenhuma das 4 tentativas recusadas chegou a criar um terminal", () => {
    assert.equal(ptysSpawned, 1, "só a conexão autorizada pode instanciar o PTY");
  });
});
