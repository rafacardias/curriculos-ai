/**
 * Stub de rede para os testes de adapter.
 *
 * Por que substituir globalThis.fetch em vez de injetar fetchJson/fetchText:
 * o stub deixa TODO o código real rodar — AbortSignal.timeout, checagem de res.ok,
 * os schemas zod de cada adapter, stripHtml, parseRssItems, os regex do LinkedIn.
 * Injetar o fetcher pularia exatamente a camada que queremos proteger.
 *
 * KILL-SWITCH: URL sem fixture registrada FALHA o teste em vez de ir à internet.
 */
export interface StubRoute {
  body: string;
  status?: number;
  contentType?: string;
}

export interface FetchStub {
  /** URLs que o código sob teste pediu, na ordem. */
  readonly calls: string[];
  restore(): void;
}

export function installFetchStub(routes: Array<[RegExp, StubRoute]>): FetchStub {
  const real = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    calls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) {
      throw new Error(
        `REDE REAL BLOQUEADA — nenhuma fixture casa com a URL pedida:\n  ${url}\n` +
          `Registre a rota em installFetchStub() ou corrija o adapter.`
      );
    }
    const [, route] = hit;
    return new Response(route.body, {
      status: route.status ?? 200,
      headers: { "content-type": route.contentType ?? "application/json" },
    });
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = real;
    },
  };
}
