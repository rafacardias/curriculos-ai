/**
 * `applyClientSideFilters` isolada — o único lugar do sistema que filtra o que
 * a fonte não resolveu.
 *
 * O caso que mais importa aqui NÃO é remoto-vs-presencial (esse é óbvio): é a
 * vaga SEM modalidade declarada. Descartá-la seria inventar "é presencial" a
 * partir de ausência de dado — a classe de erro do BUG-007. Por isso a política
 * é parâmetro obrigatório e tem teste dos dois lados.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyClientSideFilters } from "../../src/core/search-filters.js";
import type { AdapterCapabilities } from "../../src/adapters/types.js";
import type { RawJob } from "../../src/core/types.js";

const CAPS_BURRA: AdapterCapabilities = { location: false, remoteOnly: false, allRemote: false };
const CAPS_FONTE_FILTRA: AdapterCapabilities = { location: true, remoteOnly: true, allRemote: false };
const CAPS_TUDO_REMOTO: AdapterCapabilities = { location: false, remoteOnly: false, allRemote: true };

const job = (over: Partial<RawJob> = {}): RawJob => ({
  source: "linkedin",
  url: `https://exemplo.com/v/${Math.random()}`,
  title: "Analista de Automação",
  companyName: "ACME",
  language: "pt",
  ...over,
});

/** `null` não existe no tipo, mas chega do banco/JSON — o filtro tem de aguentar. */
const semModalidade = () => job({ remoteType: undefined });
const modalidadeNula = () => job({ remoteType: null as unknown as undefined });

describe("applyClientSideFilters — modalidade", () => {
  it("remoteOnly ausente: não filtra nada", () => {
    const jobs = [job({ remoteType: "onsite" }), job({ remoteType: "hybrid" }), semModalidade()];
    const r = applyClientSideFilters(jobs, { query: "x" }, CAPS_BURRA, { unknownRemoteType: "drop" });
    assert.equal(r.kept.length, 3, "sem remoteOnly, nem a política de NULL é consultada");
    assert.deepEqual(r.ignored, []);
  });

  it("remote passa", () => {
    const jobs = [job({ remoteType: "remote" })];
    const r = applyClientSideFilters(jobs, { query: "x", remoteOnly: true }, CAPS_BURRA, {
      unknownRemoteType: "pass",
    });
    assert.deepEqual(r.kept.map((j) => j.remoteType), ["remote"]);
  });

  it("onsite e hybrid caem", () => {
    const jobs = [job({ remoteType: "onsite" }), job({ remoteType: "hybrid" }), job({ remoteType: "remote" })];
    const r = applyClientSideFilters(jobs, { query: "x", remoteOnly: true }, CAPS_BURRA, {
      unknownRemoteType: "pass",
    });
    assert.deepEqual(r.kept.map((j) => j.remoteType), ["remote"]);
    assert.equal(r.ignored.length, 1, "descarte no cliente precisa ser reportado, não silencioso");
    assert.match(r.ignored[0]!, /2 de 3/);
  });

  it('modalidade ausente com "pass" PASSA — ausência de dado não é prova de presencial', () => {
    const jobs = [semModalidade(), modalidadeNula(), job({ remoteType: "onsite" })];
    const r = applyClientSideFilters(jobs, { query: "x", remoteOnly: true }, CAPS_BURRA, {
      unknownRemoteType: "pass",
    });
    assert.equal(r.kept.length, 2, "undefined e null seguem a política, não viram onsite");
  });

  it('a mesma modalidade ausente com "drop" CAI — prova que o parâmetro é lido', () => {
    const jobs = [semModalidade(), modalidadeNula(), job({ remoteType: "remote" })];
    const r = applyClientSideFilters(jobs, { query: "x", remoteOnly: true }, CAPS_BURRA, {
      unknownRemoteType: "drop",
    });
    assert.deepEqual(r.kept.map((j) => j.remoteType), ["remote"]);
  });

  it("fonte que resolve remoteOnly no servidor: no-op, nada é refiltrado", () => {
    // A vaga sem modalidade veio de uma busca que JÁ pediu workplaceType=remote.
    const jobs = [semModalidade(), job({ remoteType: "onsite" })];
    const r = applyClientSideFilters(jobs, { query: "x", remoteOnly: true }, CAPS_FONTE_FILTRA, {
      unknownRemoteType: "drop",
    });
    assert.equal(r.kept.length, 2, "refiltrar o que a fonte já filtrou descarta vaga boa");
  });

  it("fonte 100% remota: remoteOnly é no-op, não lacuna", () => {
    const jobs = [job({ remoteType: "remote" }), semModalidade()];
    const r = applyClientSideFilters(jobs, { query: "x", remoteOnly: true }, CAPS_TUDO_REMOTO, {
      unknownRemoteType: "drop",
    });
    assert.equal(r.kept.length, 2);
  });
});

describe("applyClientSideFilters — localização", () => {
  it("location pedida a fonte que não resolve: não filtra e DIZ que não filtrou", () => {
    const jobs = [job({ location: "Anywhere" }), job({ location: "EMEA" }), job({ location: "Brazil" })];
    const r = applyClientSideFilters(jobs, { query: "x", location: "Brazil" }, CAPS_BURRA, {
      unknownRemoteType: "pass",
    });
    assert.equal(r.kept.length, 3, "casar texto livre mataria 'Anywhere' e 'EMEA'");
    assert.equal(r.ignored.length, 1);
    assert.match(r.ignored[0]!, /location "Brazil" NÃO foi aplicada/);
  });

  it("location pedida a fonte que resolve: nada a reportar", () => {
    const jobs = [job({ location: "Belo Horizonte, MG" })];
    const r = applyClientSideFilters(jobs, { query: "x", location: "Belo Horizonte" }, CAPS_FONTE_FILTRA, {
      unknownRemoteType: "pass",
    });
    assert.equal(r.kept.length, 1);
    assert.deepEqual(r.ignored, []);
  });
});
