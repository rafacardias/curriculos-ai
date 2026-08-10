/**
 * Guarda a classe de bug que aconteceu de verdade: 5 empresas marcadas
 * "Verificada" em docs/company-watch-candidates.md ficaram uma sessão
 * inteira sem entrar em config/companies.yaml, e nada reclamou. Os
 * fixtures abaixo reproduzem essa forma exata de divergência — não a
 * corrigem, só provam que o detector a pega.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import "../helpers/sandbox.js";
import { REPO_ROOT } from "../helpers/sandbox.js";
import {
  parseCandidatesDoc,
  findRegistryDivergences,
} from "../../src/core/company-watch-registry.js";
import { CompanyWatchSchema, type CompanyWatch } from "../../src/core/companies-config.js";

const yaml = (companies: CompanyWatch[]) => companies;

describe("parseCandidatesDoc", () => {
  it("lê linhas da tabela sob '## Status', ignora cabeçalho e separador", () => {
    const md = `# título\n\n## Status\n\n| Empresa | Grupo | Status | Handle | Vagas efetivas | Nota |\n|---|---|---|---|---:|---|\n| ACME | A | **Em produção** | \`acme\` | 5 | nota |\n\n## Outra seção\n\n| Não | Deveria | Entrar | Aqui | — | — |\n`;
    const rows = parseCandidatesDoc(md);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { empresa: "ACME", grupo: "A", status: "Em produção", handle: "acme" });
  });

  it("linha sem handle (ex.: 'Sem board Gupy') vem com handle null", () => {
    const md = `## Status\n\n| Empresa | Grupo | Status | Handle | Vagas efetivas | Nota |\n|---|---|---|---|---:|---|\n| Fictícia | A | Sem board Gupy | 3 handles tentados (404) | — | — |\n`;
    const rows = parseCandidatesDoc(md);
    assert.equal(rows[0]!.handle, null);
  });
});

describe("findRegistryDivergences — reproduz o bug real (fixture, não o arquivo real)", () => {
  it("empresa 'Em produção' no doc sem entrada no YAML: detecta (reproduz o lote 1 esquecido)", () => {
    // Exatamente a forma do bug real: 5 empresas ficaram "Verificada"/"Em
    // produção" no log sem NUNCA entrar no companies.yaml.
    const doc = parseCandidatesDoc(
      `## Status\n\n| Empresa | Grupo | Status | Handle | Vagas efetivas | Nota |\n|---|---|---|---|---:|---|\n| Banco Fictício | A | **Em produção** | \`bancoficticio\` | 22 | |\n`
    );
    const registrySemEssaEmpresa = yaml([]);

    const divergences = findRegistryDivergences(doc, registrySemEssaEmpresa);

    assert.equal(divergences.length, 1);
    assert.equal(divergences[0]!.kind, "doc-sem-yaml");
    assert.equal(divergences[0]!.handle, "bancoficticio");
  });

  it("nenhuma divergência quando doc e YAML contam a mesma história", () => {
    const doc = parseCandidatesDoc(
      `## Status\n\n| Empresa | Grupo | Status | Handle | Vagas efetivas | Nota |\n|---|---|---|---|---:|---|\n| Banco Fictício | A | **Em produção** | \`bancoficticio\` | 22 | |\n`
    );
    const registry = yaml([
      CompanyWatchSchema.parse({ name: "Banco Fictício", ats: "gupy", handle: "bancoficticio" }),
    ]);

    assert.deepEqual(findRegistryDivergences(doc, registry), []);
  });

  it("entrada no YAML sem linha 'Em produção' correspondente no doc: detecta (o inverso do bug real)", () => {
    const doc = parseCandidatesDoc(`## Status\n\n| Empresa | Grupo | Status | Handle | Vagas efetivas | Nota |\n|---|---|---|---|---:|---|\n`);
    const registry = yaml([
      CompanyWatchSchema.parse({ name: "Empresa Órfã", ats: "gupy", handle: "orfa" }),
    ]);

    const divergences = findRegistryDivergences(doc, registry);

    assert.equal(divergences.length, 1);
    assert.equal(divergences[0]!.kind, "yaml-sem-doc");
    assert.equal(divergences[0]!.handle, "orfa");
  });

  it("nome do doc pode divergir do 'name' do YAML sem virar divergência — a chave é o handle", () => {
    // Caso real: doc tem "IGL – Importação e Comércio de Materiais de
    // Construção", o YAML tem só "IGL". Mesmo handle, não é bug.
    const doc = parseCandidatesDoc(
      `## Status\n\n| Empresa | Grupo | Status | Handle | Vagas efetivas | Nota |\n|---|---|---|---|---:|---|\n| IGL – Importação e Comércio de Materiais de Construção | G | **Em produção** | \`vagasgrupoigl\` | 5 | |\n`
    );
    const registry = yaml([CompanyWatchSchema.parse({ name: "IGL", ats: "gupy", handle: "vagasgrupoigl" })]);

    assert.deepEqual(findRegistryDivergences(doc, registry), []);
  });

  it("handle duplicado entre duas entradas do YAML: detecta (a classe Algar Tech)", () => {
    // O caso real foi EVITADO (não registrei "Algar Tech" com o handle
    // "algar" já usado por "Algar") — este teste prova que, se alguém
    // registrasse de novo, o detector pegaria.
    const doc = parseCandidatesDoc(
      `## Status\n\n| Empresa | Grupo | Status | Handle | Vagas efetivas | Nota |\n|---|---|---|---|---:|---|\n| Algar | A | **Em produção** | \`algar\` | — | |\n| Algar Tech | D | **Em produção** | \`algar\` | — | |\n`
    );
    const registry = yaml([
      CompanyWatchSchema.parse({ name: "Algar", ats: "gupy", handle: "algar" }),
      CompanyWatchSchema.parse({ name: "Algar Tech", ats: "gupy", handle: "algar" }),
    ]);

    const divergences = findRegistryDivergences(doc, registry);

    assert.ok(divergences.some((d) => d.kind === "handle-duplicado" && d.handle === "algar"));
  });
});

describe("registro real do repo — regression guard", () => {
  it("docs/company-watch-candidates.md e config/companies.yaml não divergem hoje", () => {
    const doc = parseCandidatesDoc(
      readFileSync(join(REPO_ROOT, "docs", "company-watch-candidates.md"), "utf-8")
    );
    const registry = (parse(readFileSync(join(REPO_ROOT, "config", "companies.yaml"), "utf-8")) as unknown[]).map(
      (c) => CompanyWatchSchema.parse(c)
    );

    const divergences = findRegistryDivergences(doc, registry);
    assert.deepEqual(
      divergences,
      [],
      `divergência real entre o doc e o YAML: ${JSON.stringify(divergences, null, 2)}`
    );
  });
});
