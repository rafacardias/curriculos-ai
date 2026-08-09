import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import "../helpers/sandbox.js";
import { REPO_ROOT } from "../helpers/sandbox.js";
import { CompanyWatchSchema, loadCompaniesConfig } from "../../src/core/companies-config.js";

describe("CompanyWatchSchema", () => {
  it("aceita o formato mínimo, com enabled default true", () => {
    const c = CompanyWatchSchema.parse({ name: "Localiza", ats: "gupy", handle: "localiza" });
    assert.equal(c.enabled, true);
    assert.deepEqual(c.tracks, []);
  });

  it("recusa ats fora do que company-watch.ts sabe buscar hoje", () => {
    assert.throws(() =>
      CompanyWatchSchema.parse({ name: "Hotmart", ats: "greenhouse", handle: "hotmart" })
    );
  });

  it("recusa handle ou name vazio", () => {
    assert.throws(() => CompanyWatchSchema.parse({ name: "", ats: "gupy", handle: "x" }));
    assert.throws(() => CompanyWatchSchema.parse({ name: "X", ats: "gupy", handle: "" }));
  });
});

describe("loadCompaniesConfig", () => {
  it("lê o fixture do sandbox de teste (tests/fixtures/sandbox-root/config/companies.yaml)", () => {
    // A ausência de arquivo devolvendo [] (mesmo padrão de loadTracks) é
    // comportamento da função — coberto indiretamente aqui: se o fixture
    // sumisse, este teste reprovaria por handle ausente, não por lista vazia
    // inesperada. O sandbox SEMPRE tem companies.yaml (as fixtures de
    // company-watch.test.ts dependem dele), então não há como exercitar o
    // caminho "sem arquivo" nesta suíte sem um sandbox à parte.
    const companies = loadCompaniesConfig();
    assert.ok(companies.some((c) => c.handle === "ficticia-holding"));
  });

  it("o config/companies.yaml real do repo parseia contra o schema", () => {
    // Não usa loadCompaniesConfig() (que lê de CURRICULOS_ROOT/sandbox) — lê o
    // arquivo real do repositório direto, só pra provar que o cadastro do
    // operador é válido contra o schema que o código realmente usa.
    const raw = parse(readFileSync(join(REPO_ROOT, "config", "companies.yaml"), "utf-8"));
    const companies = raw.map((c: unknown) => CompanyWatchSchema.parse(c));
    assert.ok(companies.length >= 3);
    assert.ok(companies.some((c: { handle: string }) => c.handle === "localiza"));
  });
});
