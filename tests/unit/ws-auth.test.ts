import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../helpers/sandbox.js";
import {
  isAuthorizedUpgrade,
  newSessionToken,
  allowedOrigins,
  type UpgradeRequest,
} from "../../src/server/ws-auth.js";

const PORT = 4780;
const TOKEN = "11111111-2222-3333-4444-555555555555";
const req = (origin: string | undefined, url: string): UpgradeRequest => ({
  url,
  headers: { origin },
});

describe("isAuthorizedUpgrade", () => {
  it("aceita Origin da allowlist com o token correto", () => {
    for (const origin of allowedOrigins(PORT)) {
      assert.deepEqual(isAuthorizedUpgrade(req(origin, `/term?token=${TOKEN}`), TOKEN, PORT), {
        ok: true,
      });
    }
  });

  it("recusa sem token", () => {
    const v = isAuthorizedUpgrade(req(`http://localhost:${PORT}`, "/term"), TOKEN, PORT);
    assert.equal(v.ok, false);
    assert.equal(v.ok === false && v.reason, "token");
  });

  it("recusa token errado", () => {
    const v = isAuthorizedUpgrade(req(`http://localhost:${PORT}`, "/term?token=errado"), TOKEN, PORT);
    assert.equal(v.ok, false);
    assert.equal(v.ok === false && v.reason, "token");
  });

  it("recusa Origin de outro site, mesmo com o token certo", () => {
    // O cenário real: uma página aberta noutra aba tentando falar com o localhost.
    const v = isAuthorizedUpgrade(req("https://exemplo-malicioso.com", `/term?token=${TOKEN}`), TOKEN, PORT);
    assert.equal(v.ok, false);
    assert.equal(v.ok === false && v.reason, "origin");
  });

  it("recusa quando não há header Origin (cliente não-browser)", () => {
    const v = isAuthorizedUpgrade(req(undefined, `/term?token=${TOKEN}`), TOKEN, PORT);
    assert.equal(v.ok, false);
    assert.equal(v.ok === false && v.reason, "origin");
  });

  it("recusa Origin parecida — a checagem é igualdade, não prefixo", () => {
    for (const origin of [
      `http://localhost:${PORT}.evil.com`,
      `http://localhost:${PORT + 1}`,
      `https://localhost:${PORT}`,
      `http://127.0.0.1:${PORT}@evil.com`,
    ]) {
      const v = isAuthorizedUpgrade(req(origin, `/term?token=${TOKEN}`), TOKEN, PORT);
      assert.equal(v.ok, false, `${origin} deveria ser recusada`);
    }
  });

  it("URL malformada não derruba a checagem", () => {
    const v = isAuthorizedUpgrade(req(`http://localhost:${PORT}`, "://%%%"), TOKEN, PORT);
    assert.equal(v.ok, false);
  });

  it("token de tamanho diferente é recusado sem exceção", () => {
    const v = isAuthorizedUpgrade(req(`http://localhost:${PORT}`, "/term?token=x"), TOKEN, PORT);
    assert.equal(v.ok, false);
  });
});

describe("injeção do token no HTML servido", () => {
  it("app.html tem exatamente um placeholder, e ele some ao ser servido", () => {
    // Mesmo replaceAll que src/server/index.ts aplica ao servir "/".
    const html = readFileSync(join(REPO_ROOT, "src/server/app.html"), "utf-8");
    const ocorrencias = html.split("__WS_TOKEN__").length - 1;
    assert.equal(ocorrencias, 1, "o placeholder precisa existir exatamente uma vez");

    const servido = html.replaceAll("__WS_TOKEN__", TOKEN);
    assert.doesNotMatch(servido, /__WS_TOKEN__/, "nenhum placeholder pode sobrar no HTML servido");
    assert.ok(servido.includes(TOKEN));
  });

  it("o cliente manda o token na query do /term", () => {
    const html = readFileSync(join(REPO_ROOT, "src/server/app.html"), "utf-8");
    assert.match(html, /\/term\?token=\$\{encodeURIComponent\(WS_TOKEN\)\}/);
  });

  it("o cliente recarrega a página quando o token expira, em vez de morrer na tela", () => {
    // Reiniciar o launchd gera token novo e invalida abas abertas; sem isso o
    // usuário ficaria olhando um terminal morto sem entender o motivo.
    const html = readFileSync(join(REPO_ROOT, "src/server/app.html"), "utf-8");
    assert.match(html, /e\.code === 4401 \|\| e\.code === 4403/);
    assert.match(html, /location\.reload\(\)/);
    assert.match(html, /sessionStorage\.getItem\("termReload"\)/, "precisa de guard anti-loop");
    assert.match(html, /sessionStorage\.removeItem\("termReload"\)/, "o guard é limpo ao conectar");
  });
});

describe("newSessionToken", () => {
  it("gera token único por chamada, no formato UUID", () => {
    const a = newSessionToken();
    const b = newSessionToken();
    assert.notEqual(a, b, "reiniciar o serviço precisa invalidar o token anterior");
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
