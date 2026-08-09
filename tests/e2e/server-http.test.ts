/**
 * Smoke HTTP real do dispatcher — ACHADO-09 (KNOWN-BUGS.md).
 *
 * Até esta suíte, nenhum teste subia `createServer(...)` de verdade: todos
 * chamavam as funções (`apiQueue`, `doApply`, ...) direto, pulando o dispatcher
 * inteiro. Foi assim que o `ERR_HTTP_HEADERS_SENT` (reproduzido manualmente 3x,
 * em `main` e na branch) nunca apareceu numa rodada de `npm test`.
 *
 * Porta efêmera (`listen(0)`), banco de sandbox (`CURRICULOS_ROOT`, via
 * `../helpers/sandbox.js`) — nunca a porta 4780 real, nunca o banco de produção.
 * `createApp()` (src/server/index.ts) monta o servidor sem escutar nem abrir
 * browser; só este teste chama `.listen()`.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resetDb, runCli } from "../helpers/sandbox.js";
import { createApp } from "../../src/server/index.js";
import { insertJob, updateJobScore, getJob } from "../../src/db/repo/jobs.js";
import { createTrack, updateTrack } from "../../src/db/repo/profile-tracks.js";
import { loadConfig } from "../../src/core/config.js";
import { blocksGenerationByScore } from "../../src/core/policy.js";

let server: Server;
let base: string;

before(async () => {
  server = createApp();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(() => server.close());

beforeEach(() => resetDb());

describe("GET /api/tracks", () => {
  it("200, JSON, e devolve as trilhas cadastradas", async () => {
    createTrack({ id: "qa", name: "QA", keywords: ["qa", "teste"] });
    createTrack({ id: "produtos", name: "Produtos", keywords: ["pm", "po"] });
    updateTrack("produtos", { enabled: false });

    const res = await fetch(`${base}/api/tracks`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    const body = (await res.json()) as unknown[];
    assert.equal(body.length, 2);
  });

  it("ACHADO — a rota devolve TODAS as trilhas, não só as enabled; o filtro é client-side em app.html (loadTrackFilter)", async () => {
    // Registrado aqui porque diverge da leitura mais óbvia de "GET /api/tracks
    // alimenta o dropdown que só mostra enabled" — o dropdown filtra depois de
    // receber a lista inteira. O painel de CRUD em CONFIG também usa esta MESMA
    // rota e precisa ver as desabilitadas pra poder reabilitá-las — é por isso
    // que o servidor não filtra. Não mudei o comportamento; só provei qual é.
    createTrack({ id: "qa", name: "QA", keywords: [] });
    createTrack({ id: "desativada", name: "Desativada", keywords: [] });
    updateTrack("desativada", { enabled: false });

    const body = (await (await fetch(`${base}/api/tracks`)).json()) as Array<{ id: string; enabled: number }>;
    const desativada = body.find((t) => t.id === "desativada");
    assert.ok(desativada, "a rota inclui a trilha desabilitada");
    assert.equal(desativada.enabled, 0);
  });
});

describe("POST /api/score-confirm", () => {
  function seedLowScoreJob() {
    const row = insertJob({
      source: "gupy",
      url: "https://ficticia.gupy.io/job/http-smoke",
      title: "Vaga HTTP Smoke — Score Baixo",
      companyName: "HTTP Smoke Co",
      language: "pt",
      remoteType: "remote", // confirmado — não dispara o gate de modalidade
    })!;
    updateJobScore(row.id, 25, {}, null, "ignorar: score baixo", "queued");
    return row.id;
  }

  it("200 e grava score_confirmed_at — score em si não muda", async () => {
    const jobId = seedLowScoreJob();
    const res = await fetch(`${base}/api/score-confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, note: "conheço o CEO, quero aplicar mesmo assim" }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });

    const job = getJob(jobId)!;
    assert.ok(job.score_confirmed_at);
    assert.equal(job.score_confirmed_note, "conheço o CEO, quero aplicar mesmo assim");
    assert.equal(job.score, 25, "confirmar não reescreve o score calculado");
  });

  it("blocksGenerationByScore deixa de bloquear depois da confirmação via HTTP", async () => {
    const jobId = seedLowScoreJob();
    const config = loadConfig();
    assert.ok(blocksGenerationByScore(config, getJob(jobId)!), "bloqueia antes de confirmar");

    await fetch(`${base}/api/score-confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, note: "teste" }),
    });

    assert.equal(blocksGenerationByScore(config, getJob(jobId)!), null, "libera depois de confirmar");
  });

  it("prova pelo CLI real: `kit prepare` sai 6 antes, deixa de sair 6 depois do POST", async () => {
    const jobId = seedLowScoreJob();

    const antes = runCli("src/cli/kit.ts", ["prepare", jobId]);
    assert.equal(antes.status, 6, "antes de confirmar, o gate de score recusa");
    assert.match(antes.stderr, /GERAÇÃO RECUSADA.*score/);

    await fetch(`${base}/api/score-confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, note: "teste" }),
    });

    const depois = runCli("src/cli/kit.ts", ["prepare", jobId]);
    assert.notEqual(depois.status, 6, "depois de confirmar, o gate de score não recusa mais");
    assert.doesNotMatch(depois.stderr, /GERAÇÃO RECUSADA.*score/);
  });
});

describe("concorrência — tentativa de reproduzir ERR_HTTP_HEADERS_SENT (ACHADO-09)", () => {
  it("uma rajada de GETs concorrentes (o que loadAll() dispara ao abrir a página) não derruba o processo nem produz resposta corrompida", async () => {
    // Mesmo conjunto de chamadas que app.html loadAll() dispara ao carregar:
    // resumo, fila, quadro de aplicações, empresas, pipeline, rejeitadas, trilhas.
    const rotas = [
      "/api/summary",
      "/api/queue",
      "/api/applications",
      "/api/companies",
      "/api/pipeline",
      "/api/rejected",
      "/api/tracks",
    ];
    const respostas = await Promise.all(rotas.map((r) => fetch(`${base}${r}`)));
    for (const [i, res] of respostas.entries()) {
      assert.equal(res.status, 200, `${rotas[i]} deveria devolver 200`);
      // JSON válido — se o dispatcher tivesse corrompido a resposta (dois writes
      // na mesma conexão), o parse aqui reprovaria.
      await assert.doesNotReject(res.json(), `${rotas[i]} deveria devolver JSON válido`);
    }
  });
});
