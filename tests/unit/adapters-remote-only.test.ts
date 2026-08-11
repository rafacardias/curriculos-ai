/**
 * BUG-001 CORRIGIDO — este teste era o congelamento do bug e foi INVERTIDO.
 *
 * O contrato agora não é "nenhum adapter filtra", é "cada adapter faz o que
 * DECLARA em `capabilities`":
 *   - capability true  → a URL pedida muda e leva o parâmetro da fonte;
 *   - capability false → a URL é IDÊNTICA (declaração honesta) e quem age é o
 *     filtro cliente (`applyClientSideFilters`, coberto em search-filters.test.ts).
 *
 * Adapter que declarar true e não mudar a URL — ou declarar false e mudar —
 * quebra aqui. É essa amarração que impede a capability de virar decoração,
 * que foi exatamente o destino do `remote_only` antes.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../helpers/sandbox.js";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import { allRoutes } from "../helpers/routes.js";
import { ALL_ADAPTERS } from "../../src/adapters/index.js";

let stub: FetchStub | undefined;
afterEach(() => stub?.restore());

const QUERY = "quality assurance";

/** Roda a busca e devolve só a URL de BUSCA (a 1ª chamada, nunca os detalhes). */
async function searchUrlOf(
  adapter: (typeof ALL_ADAPTERS)[string],
  params: { location?: string; remoteOnly?: boolean }
): Promise<string> {
  stub = installFetchStub(allRoutes());
  await adapter!.search({ query: QUERY, ...params });
  const url = stub.calls[0]!;
  stub.restore();
  stub = undefined;
  return url;
}

for (const [id, adapter] of Object.entries(ALL_ADAPTERS)) {
  const caps = adapter.capabilities;

  describe(`adapter ${id} — capabilities declaradas`, () => {
    it(
      caps.remoteOnly
        ? "declara remoteOnly: manda o filtro de modalidade na URL"
        : "declara remoteOnly falso: a URL não muda (quem filtra é o cliente)",
      async () => {
        const com = await searchUrlOf(adapter, { remoteOnly: true });
        const sem = await searchUrlOf(adapter, { remoteOnly: false });

        if (caps.remoteOnly) {
          assert.notEqual(com, sem, `${id}: declara resolver remoteOnly mas pede a mesma URL`);
          assert.match(
            com,
            /workplaceType|remote[_-]?only|f_WT|isRemote/i,
            `${id}: declara resolver remoteOnly mas não manda parâmetro nenhum de modalidade`
          );
        } else {
          assert.equal(
            com,
            sem,
            `${id}: declara NÃO resolver remoteOnly mas mudou a URL — atualize a capability`
          );
        }
      }
    );

    it(
      caps.location
        ? "declara location: manda a localização na URL"
        : "declara location falso: a URL não muda com localização",
      async () => {
        const com = await searchUrlOf(adapter, { location: "Belo Horizonte" });
        const sem = await searchUrlOf(adapter, {});

        if (caps.location) {
          assert.notEqual(com, sem, `${id}: declara resolver location mas pede a mesma URL`);
          assert.match(
            com,
            /Belo(%20|\+)Horizonte/i,
            `${id}: declara resolver location mas não manda o valor pedido`
          );
        } else {
          assert.equal(
            com,
            sem,
            `${id}: declara NÃO resolver location mas mudou a URL — atualize a capability`
          );
        }
      }
    );

    it("allRemote só é declarado por fonte que marca toda vaga como remota", async () => {
      if (!caps.allRemote) return;
      stub = installFetchStub(allRoutes());
      const { jobs } = await adapter.search({ query: QUERY });
      assert.ok(jobs.length > 0, `${id}: fixture não devolveu vaga — teste não prova nada`);
      for (const j of jobs) {
        assert.equal(j.remoteType, "remote", `${id}: declara allRemote e devolveu "${j.remoteType}"`);
      }
    });
  });
}
