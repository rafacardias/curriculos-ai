import type { RawJob } from "../core/types.js";

export interface SearchParams {
  query: string;
  location?: string;
  remoteOnly?: boolean;
  limit?: number;
}

/**
 * O que a fonte resolve SOZINHA, no servidor dela.
 *
 * A declaração é o contrato: o que estiver `false` aqui é o que o filtro cliente
 * (`src/core/search-filters.ts`) precisa tratar — ou assumir explicitamente que
 * não trata. Não existe "adapter que ignora em silêncio": ou a capability é
 * verdadeira e a URL muda, ou é falsa e alguém acima decide o que fazer.
 */
export interface AdapterCapabilities {
  /** A fonte resolve `location` no servidor. */
  location: boolean;
  /** A fonte resolve `remoteOnly` no servidor. */
  remoteOnly: boolean;
  /** Todo resultado é remoto por construção — `remoteOnly` é no-op, não lacuna. */
  allRemote: boolean;
}

/**
 * Contrato de toda fonte de vagas. Implementações devem:
 * - nunca lançar exceção para fora (retornar erros no resultado);
 * - respeitar timeout próprio (o pipeline também impõe um global);
 * - declarar `capabilities` honestamente — é o que o pipeline usa para decidir
 *   o que ainda precisa ser filtrado no cliente.
 */
export interface JobSourceAdapter {
  readonly id: string;
  readonly capabilities: AdapterCapabilities;
  search(params: SearchParams): Promise<AdapterResult>;
}

export interface AdapterResult {
  jobs: RawJob[];
  errors: string[];
  /**
   * Critério que a fonte recebeu e NÃO aplicou, dito em voz alta.
   *
   * Separado de `errors` de propósito: pedir um recorte que a fonte não sabe
   * fazer não é falha da fonte, e cair em `errors` marcaria o adapter como
   * quebrado no alerta de fonte morta. O pipeline junta isto ao `ignored` do
   * filtro cliente em `search_runs.per_source`.
   */
  ignored?: string[];
}

export async function fetchJson(url: string, init?: RequestInit, timeoutMs = 15000): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      accept: "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.text();
}

/** Remove tags HTML e normaliza espaços — extração bruta de texto de JD. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Heurística simples de idioma pt/en pelo vocabulário do texto. */
export function detectLanguage(text: string): "pt" | "en" {
  const sample = text.toLowerCase().slice(0, 2000);
  const ptHits = (sample.match(/\b(que|para|com|não|você|nós|é|são|experiência|vaga|trabalho|conhecimento)\b/g) ?? []).length;
  const enHits = (sample.match(/\b(the|and|with|you|we|is|are|experience|job|work|knowledge)\b/g) ?? []).length;
  return ptHits >= enHits ? "pt" : "en";
}
