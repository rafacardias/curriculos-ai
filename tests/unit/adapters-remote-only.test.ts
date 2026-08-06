/**
 * BUG-001 CONGELADO — `remote_only` é configuração morta.
 *
 * A chave existe em config/config.yaml, no SearchSpec (core/config.ts), no
 * SearchParams (adapters/types.ts) e é editável pela aba Config da UI.
 * Nenhum dos 5 adapters sequer desestrutura `remoteOnly` — o filtro que a
 * interface promete nunca acontece.
 *
 * Estes testes provam que ligar e desligar a opção produz resultado IDÊNTICO.
 * Quando a Onda 1 implementar o filtro de verdade, ELES DEVEM FALHAR.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../helpers/sandbox.js";
import { installFetchStub, type FetchStub } from "../helpers/net.js";
import { allRoutes } from "../helpers/routes.js";
import { ALL_ADAPTERS } from "../../src/adapters/index.js";

let stub: FetchStub | undefined;
afterEach(() => stub?.restore());

const PARAMS = { query: "quality assurance", location: "Brazil" };

for (const [id, adapter] of Object.entries(ALL_ADAPTERS)) {
  describe(`adapter ${id}`, () => {
    it("ignora remoteOnly: mesmas URLs pedidas e mesmo resultado", async () => {
      stub = installFetchStub(allRoutes());
      const comFiltro = await adapter.search({ ...PARAMS, remoteOnly: true });
      const urlsComFiltro = [...stub.calls];
      stub.restore();

      stub = installFetchStub(allRoutes());
      const semFiltro = await adapter.search({ ...PARAMS, remoteOnly: false });
      const urlsSemFiltro = [...stub.calls];

      assert.deepEqual(
        urlsComFiltro,
        urlsSemFiltro,
        `${id}: remoteOnly mudou a URL pedida — o BUG-001 foi corrigido, inverta o teste`
      );
      assert.deepEqual(
        semFiltro.jobs.map((j) => j.url),
        comFiltro.jobs.map((j) => j.url),
        `${id}: remoteOnly mudou o conjunto de vagas — o BUG-001 foi corrigido, inverta o teste`
      );
    });

    it("nenhum parâmetro de 'remoto' é enviado à fonte", async () => {
      stub = installFetchStub(allRoutes());
      await adapter.search({ ...PARAMS, remoteOnly: true });
      const searchUrl = stub.calls[0]!;
      assert.doesNotMatch(
        searchUrl,
        /remote[_-]?only|isRemote|workplaceType|remoteType/i,
        `${id}: já envia filtro de remoto — o BUG-001 foi corrigido, inverta o teste`
      );
    });
  });
}
