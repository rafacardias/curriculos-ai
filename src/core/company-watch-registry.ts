/**
 * Verificação cruzada entre `docs/company-watch-candidates.md` (log de
 * verificação, humano) e `config/companies.yaml` (registro que o código de
 * fato lê) — candidato a BUG registrado em `KNOWN-BUGS.md` (BUG-010,
 * "Varredura"): os dois podem divergir em silêncio. Aconteceu de verdade —
 * 5 empresas ficaram marcadas "Verificada" no doc por uma sessão inteira
 * sem nunca entrar no YAML, e nada reclamou.
 *
 * Não é o mesmo bug do `answers.ts:45`/`scoreJob` (ausência de `ORDER BY`
 * decidindo empate) — é ausência de verificação cruzada entre dois
 * artefatos que deveriam contar a mesma história.
 */
import type { CompanyWatch } from "./companies-config.js";

export interface CandidatesDocRow {
  empresa: string;
  grupo: string;
  status: string;
  handle: string | null;
}

const STATUS_RE = /\*\*(.+?)\*\*/;
const HANDLE_RE = /`([^`]+)`/;

/** Extrai as linhas da tabela sob "## Status" — ignora cabeçalho e separador. */
export function parseCandidatesDoc(markdown: string): CandidatesDocRow[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() === "## Status");
  if (start === -1) return [];

  const rows: CandidatesDocRow[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("## ")) break; // próxima seção
    if (!line.startsWith("|")) continue;

    const cells = line
      .split("|")
      .slice(1, -1) // remove os campos vazios antes do primeiro "|" e depois do último
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    if (cells[0] === "Empresa") continue; // cabeçalho
    if (/^:?-+:?$/.test(cells[0]!)) continue; // linha separadora |---|---|

    const statusRaw = cells[2] ?? "";
    const status = STATUS_RE.exec(statusRaw)?.[1] ?? statusRaw;
    const handleMatch = HANDLE_RE.exec(cells[3] ?? "");

    rows.push({
      empresa: cells[0]!,
      grupo: cells[1] ?? "",
      status,
      handle: handleMatch ? handleMatch[1]! : null,
    });
  }
  return rows;
}

export interface RegistryDivergence {
  kind: "doc-sem-yaml" | "yaml-sem-doc" | "handle-duplicado";
  handle: string;
  detail: string;
}

/**
 * Handles que o doc marca "Em produção" mas que não têm entrada em
 * `companies.yaml`, e vice-versa — os dois lados têm de contar a mesma
 * história. Comparação por HANDLE, não por nome: o nome exibido no doc e o
 * `name` do YAML podem divergir de propósito (ex.: "IGL – Importação e
 * Comércio..." no doc vs `name: IGL` no YAML) sem que isso seja divergência
 * real — o handle é a chave estável.
 */
export function findRegistryDivergences(
  docRows: CandidatesDocRow[],
  yamlCompanies: CompanyWatch[]
): RegistryDivergence[] {
  const divergences: RegistryDivergence[] = [];

  const docEmProducao = new Map<string, string>(); // handle -> empresa
  for (const row of docRows) {
    if (row.status === "Em produção" && row.handle) {
      docEmProducao.set(row.handle, row.empresa);
    }
  }

  const yamlHandles = new Map<string, string>(); // handle -> name
  const handleCounts = new Map<string, number>();
  for (const c of yamlCompanies) {
    yamlHandles.set(c.handle, c.name);
    handleCounts.set(c.handle, (handleCounts.get(c.handle) ?? 0) + 1);
  }

  for (const [handle, empresa] of docEmProducao) {
    if (!yamlHandles.has(handle)) {
      divergences.push({
        kind: "doc-sem-yaml",
        handle,
        detail: `"${empresa}" está "Em produção" no doc (handle "${handle}") mas não tem entrada em config/companies.yaml`,
      });
    }
  }

  for (const [handle, name] of yamlHandles) {
    if (!docEmProducao.has(handle)) {
      divergences.push({
        kind: "yaml-sem-doc",
        handle,
        detail: `"${name}" está em config/companies.yaml (handle "${handle}") mas nenhuma linha do doc marca esse handle como "Em produção"`,
      });
    }
  }

  for (const [handle, count] of handleCounts) {
    if (count > 1) {
      divergences.push({
        kind: "handle-duplicado",
        handle,
        detail: `handle "${handle}" aparece ${count}× em config/companies.yaml — mesma classe do caso Algar Tech (board já coberto por outra entrada)`,
      });
    }
  }

  return divergences;
}
